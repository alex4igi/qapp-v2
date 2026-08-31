// Edge Function: operații Storage pt. editorul vizual de template-uri (Faza 3).
// Bucket-ul `contracte-templates` nu are nicio policy RLS pe storage.objects —
// orice upload/citire/copiere trece obligatoriu prin service_role, aici.
// CRUD-ul pe rândul `contract_templates` însuși merge direct din client
// (RLS `contract_templates_write_staff` permite tot staff-ul) — nu duplicăm aici,
// dar ținem allowlist-ul de mai jos oglindă a acelei policy.
import { serviceClient } from '../_shared/contracte.ts'

// Oglindește RLS-ul `contract_templates_write_staff` (migrația 20260831201000).
const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']

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

const BUCKET = 'contracte-templates'

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimină diacriticele descompuse de NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const admin = serviceClient()
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    const role = (userRes.user.app_metadata as { role?: string })?.role ?? 'front_desk'
    if (!STAFF_ROLES.includes(role)) return json({ error: 'forbidden' }, 403)

    const body = (await req.json()) as Record<string, unknown>
    const action = body.action as string

    if (action === 'upload') {
      const { tip, sezonNume, versiune, fileBase64 } = body as {
        tip: string
        sezonNume: string | null
        versiune: number
        fileBase64: string
      }
      if (!tip || !versiune || !fileBase64) {
        return json({ error: 'tip, versiune și fileBase64 sunt obligatorii' }, 400)
      }
      const slug = sezonNume ? slugify(sezonNume) : 'fara-sezon'
      const path = `${tip}/${slug}-v${versiune}.pdf`
      const bytes = base64ToBytes(fileBase64)
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upErr) return json({ error: upErr.message }, 500)
      return json({ path })
    }

    if (action === 'read-url') {
      const { path } = body as { path: string }
      if (!path) return json({ error: 'path e obligatoriu' }, 400)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 600)
      if (error || !data) return json({ error: error?.message ?? 'eroare signed url' }, 500)
      return json({ url: data.signedUrl })
    }

    if (action === 'copy') {
      const { fromPath, toPath } = body as { fromPath: string; toPath: string }
      if (!fromPath || !toPath) return json({ error: 'fromPath și toPath sunt obligatorii' }, 400)
      const { error } = await admin.storage.from(BUCKET).copy(fromPath, toPath)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: `action necunoscută: ${action}` }, 400)
  } catch (e) {
    console.error('contract-template-storage error:', e)
    return json({ error: String(e) }, 500)
  }
})
