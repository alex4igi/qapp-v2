// Edge Function: descărcarea unui document propriu din portal (rol `parinte`).
//
// Documentele generate de aplicație (contracte, acte adiționale) sunt arhivate în
// bucketul PRIVAT `contracte`; `documente_client.link` duce spre copia de Google
// Drive, care e internă — pentru părinte întoarce 401. Aici verificăm apartenența
// (RPC `get_document_storage_path`, care filtrează prin client_member_ids) și
// întoarcem un signed URL de 5 minute, cu antet de descărcare.
//
// Documentele atașate manual de recepție n-au `storage_path` — pentru ele portalul
// folosește în continuare linkul.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as jose from 'npm:jose@5'
import { pdfFileName } from '../_shared/contracte.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SIGNED_URL_TTL_SEC = 300

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    try {
      const { payload } = await jose.jwtVerify(
        token,
        new TextEncoder().encode(Deno.env.get('PORTAL_JWT_SECRET')!),
        { issuer: 'qapp-portal', audience: 'authenticated' },
      )
      const role = (payload.app_metadata as { role?: string } | undefined)?.role
      if (role !== 'parinte' || !payload.sub) return json({ error: 'forbidden' }, 403)
    } catch {
      return json({ error: 'invalid token' }, 401)
    }

    const { documentId } = (await req.json()) as { documentId?: string }
    if (!documentId) return json({ error: 'documentId obligatoriu' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!

    // Apartenența o decide DB-ul, pe JWT-ul părintelui (client_member_ids).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: storagePath, error: rpcErr } = await userClient
      .rpc('get_document_storage_path', { p_document: documentId })
    if (rpcErr) return json({ error: rpcErr.message }, 400)
    if (!storagePath) {
      return json({ error: 'Documentul nu este disponibil pentru descărcare.' }, 404)
    }

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: doc } = await admin
      .from('documente_client')
      .select('titlu, tip')
      .eq('id', documentId)
      .single()
    const fisier = pdfFileName(doc?.titlu ?? doc?.tip)

    const { data: signed, error: stErr } = await admin.storage
      .from('contracte')
      .createSignedUrl(String(storagePath), SIGNED_URL_TTL_SEC, { download: fisier })
    if (stErr || !signed?.signedUrl) {
      console.error('portal-document signed url fail:', stErr?.message)
      return json({ error: 'Documentul nu poate fi descărcat acum.' }, 500)
    }

    // Contractele au jurnal probatoriu: descărcarea din portal intră în el.
    const { data: contract } = await admin
      .from('contracte')
      .select('id')
      .eq('pdf_storage_path', String(storagePath))
      .maybeSingle()
    if (contract) {
      await admin.from('contract_events').insert({
        contract_id: contract.id,
        tip: 'descarcat',
        meta: { canal: 'portal', document_id: documentId },
      })
    }

    return json({ url: signed.signedUrl })
  } catch (e) {
    console.error('portal-document error:', e)
    return json({ error: 'Eroare internă.' }, 500)
  }
})
