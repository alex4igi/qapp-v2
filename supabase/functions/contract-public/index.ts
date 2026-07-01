// Edge Function PUBLICĂ (verify_jwt=false): pagina de semnare din portal.
//
// action='load'   → validează tokenul, marchează prima deschidere, întoarce
//                   definițiile câmpurilor + precompletările + signed URL preview.
// action='submit' → validează, salvează valori + semnătură ATOMIC (guard pe status),
//                   upsert profil semnare, loghează consimțământ + semnat (IP/UA),
//                   declanșează contract-finalize (fire-and-forget).
//
// Securitate: clientul nu primește niciodată date fără token valid; stocăm doar
// sha256(token); IP + user-agent intră în jurnalul probatoriu.
import {
  clientIp,
  isValidCnp,
  logEvent,
  serviceClient,
  sha256Hex,
  type TemplateField,
} from '../_shared/contracte.ts'

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

const MAX_SIGNATURE_BYTES = 300_000 // PNG canvas; generos dar limitat

type ContractRow = {
  id: string
  status: string
  token_expira_la: string | null
  familie_id: string
  client_id: string | null
  valori: Record<string, unknown> | null
  template_id: string
  deschis_prima_data_la: string | null
}

async function findByToken(admin: ReturnType<typeof serviceClient>, token: string) {
  const tokenHash = await sha256Hex(token)
  const { data } = await admin
    .from('contracte')
    .select('id, status, token_expira_la, familie_id, client_id, valori, template_id, deschis_prima_data_la')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  return data as ContractRow | null
}

// Precompletări din DB pentru câmpurile cu source != manual.
async function buildPrefill(
  admin: ReturnType<typeof serviceClient>,
  contract: ContractRow,
  fields: TemplateField[],
) {
  const { data: familie } = await admin
    .from('familii')
    .select('nume_familie, nume_reprezentant, prenume_reprezentant, telefon, email')
    .eq('id', contract.familie_id)
    .single()
  const { data: profil } = await admin
    .from('familii_date_semnatar')
    .select('cnp, adresa, ci_serie, ci_numar, ci_eliberat_de, ci_eliberat_la')
    .eq('familie_id', contract.familie_id)
    .maybeSingle()
  const { data: copii } = await admin
    .from('clienti')
    .select('id, nume, prenume, data_nasterii')
    .eq('familia', contract.familie_id)
    .order('data_nasterii')

  const reprezentant = [familie?.nume_reprezentant, familie?.prenume_reprezentant]
    .filter(Boolean)
    .join(' ') || familie?.nume_familie || ''

  const prefill: Record<string, unknown> = {}
  for (const f of fields) {
    switch (f.source) {
      case 'familie.reprezentant': prefill[f.key] = reprezentant; break
      case 'familie.telefon': prefill[f.key] = familie?.telefon ?? ''; break
      case 'familie.email': prefill[f.key] = familie?.email ?? ''; break
      case 'familie.cnp': prefill[f.key] = profil?.cnp ?? ''; break
      case 'familie.adresa': prefill[f.key] = profil?.adresa ?? ''; break
      case 'familie.ci':
        prefill[f.key] = profil?.ci_serie
          ? `${profil.ci_serie} ${profil.ci_numar ?? ''}`.trim()
          : ''
        break
      case 'copil.nume': {
        const copil = copii?.find((c) => c.id === contract.client_id) ?? copii?.[0]
        prefill[f.key] = copil ? `${copil.nume} ${copil.prenume ?? ''}`.trim() : ''
        break
      }
      case 'azi': prefill[f.key] = new Date().toISOString().slice(0, 10); break
      case 'manual': break
    }
  }
  return {
    prefill,
    profilExistent: !!profil?.cnp,
    copii: (copii ?? []).map((c) => ({
      id: c.id,
      nume: `${c.nume} ${c.prenume ?? ''}`.trim(),
      dataNasterii: c.data_nasterii,
    })),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const token = String(body.token ?? '')
    if (!token || token.length < 20) return json({ error: 'token invalid' }, 400)

    const admin = serviceClient()
    const contract = await findByToken(admin, token)
    if (!contract) return json({ error: 'Link invalid.' }, 404)

    // expirare
    if (
      ['trimis', 'deschis'].includes(contract.status) &&
      contract.token_expira_la && new Date(contract.token_expira_la) < new Date()
    ) {
      await admin.from('contracte').update({ status: 'expirat' }).eq('id', contract.id)
      await logEvent(admin, contract.id, 'expirat', { la: 'acces' })
      return json({ error: 'Linkul a expirat. Contactați recepția pentru unul nou.' }, 410)
    }
    if (['semnat', 'finalizat'].includes(contract.status)) {
      return json({ alreadySigned: true, message: 'Documentul a fost deja semnat. Mulțumim!' })
    }
    if (!['trimis', 'deschis'].includes(contract.status)) {
      return json({ error: 'Documentul nu mai este disponibil pentru semnare.' }, 410)
    }

    const { data: tpl } = await admin
      .from('contract_templates')
      .select('nume, tip, fields, pdf_storage_path')
      .eq('id', contract.template_id)
      .single()
    if (!tpl) return json({ error: 'Template lipsă.' }, 500)
    const fields = (tpl.fields ?? []) as TemplateField[]

    if (body.action === 'load') {
      if (!contract.deschis_prima_data_la) {
        // guard atomic pe null: două load-uri simultane → un singur event 'deschis'
        const { data: marked } = await admin
          .from('contracte')
          .update({ status: 'deschis', deschis_prima_data_la: new Date().toISOString() })
          .eq('id', contract.id)
          .is('deschis_prima_data_la', null)
          .select('id')
        if (marked && marked.length > 0) {
          await logEvent(admin, contract.id, 'deschis', {
            ip: clientIp(req),
            ua: req.headers.get('user-agent') ?? '',
          })
        }
      }

      const { data: signed } = await admin.storage
        .from('contracte-templates')
        .createSignedUrl(tpl.pdf_storage_path, 600)

      const { prefill, profilExistent, copii } = await buildPrefill(admin, contract, fields)

      return json({
        contract: { nume: tpl.nume, tip: tpl.tip },
        fields: fields.map((f) => ({
          key: f.key, label: f.label, type: f.type,
          required: f.required ?? false,
          editable: f.editable ?? f.source === 'manual',
          source: f.source,
        })),
        prefill,
        profilExistent,
        copii,
        pdfUrl: signed?.signedUrl ?? null,
      })
    }

    if (body.action === 'submit') {
      const valori = (body.valori ?? {}) as Record<string, unknown>
      const semnaturaPng = String(body.semnaturaPng ?? '')
      const consimtamant = body.consimtamant === true
      const marketingOptin = body.marketingOptin === true

      if (!consimtamant) {
        return json({ error: 'Consimțământul pentru semnarea electronică este obligatoriu.' }, 400)
      }
      if (!semnaturaPng.startsWith('data:image/png;base64,')) {
        return json({ error: 'Semnătura lipsește.' }, 400)
      }
      const pngBytes = Uint8Array.from(
        atob(semnaturaPng.slice('data:image/png;base64,'.length)),
        (c) => c.charCodeAt(0),
      )
      if (pngBytes.length < 500 || pngBytes.length > MAX_SIGNATURE_BYTES) {
        return json({ error: 'Semnătura este goală sau prea mare.' }, 400)
      }

      for (const f of fields) {
        if (f.type === 'signature' || f.type === 'copii_table') continue
        const val = valori[f.key]
        if (f.required && (val === undefined || val === null || String(val).trim() === '')) {
          return json({ error: `Câmpul „${f.label}" este obligatoriu.` }, 400)
        }
        if (f.source === 'familie.cnp' && val && !isValidCnp(String(val).trim())) {
          return json({ error: 'CNP-ul introdus nu este valid.' }, 400)
        }
      }

      const now = new Date().toISOString()
      // guard atomic: dublu-submit sau link deja folosit → 0 rânduri afectate
      const { data: updated } = await admin
        .from('contracte')
        .update({
          status: 'semnat',
          valori,
          semnat_la: now,
          consimtamant_esign_la: now,
          marketing_optin: marketingOptin,
        })
        .eq('id', contract.id)
        .in('status', ['trimis', 'deschis'])
        .select('id')
      if (!updated || updated.length === 0) {
        return json({ error: 'Documentul a fost deja semnat.' }, 409)
      }

      const semnaturaPath = `semnaturi/${contract.id}.png`
      const { error: upErr } = await admin.storage
        .from('contracte')
        .upload(semnaturaPath, pngBytes, { contentType: 'image/png', upsert: true })
      if (!upErr) {
        await admin.from('contracte').update({ semnatura_path: semnaturaPath }).eq('id', contract.id)
      }

      // profil de semnare: următoarele documente vin precompletate
      const cnpField = fields.find((f) => f.source === 'familie.cnp')
      const adresaField = fields.find((f) => f.source === 'familie.adresa')
      const ciField = fields.find((f) => f.source === 'familie.ci')
      if (cnpField || adresaField || ciField) {
        const ciRaw = ciField ? String(valori[ciField.key] ?? '').trim() : ''
        const [ciSerie, ...ciRest] = ciRaw.split(/\s+/)
        await admin.from('familii_date_semnatar').upsert({
          familie_id: contract.familie_id,
          cnp: cnpField ? String(valori[cnpField.key] ?? '').trim() || null : undefined,
          adresa: adresaField ? String(valori[adresaField.key] ?? '').trim() || null : undefined,
          ci_serie: ciRaw ? ciSerie : undefined,
          ci_numar: ciRaw ? ciRest.join(' ') || null : undefined,
          actualizat_la: now,
          actualizat_sursa: 'semnare',
        })
      }

      const ip = clientIp(req)
      const ua = req.headers.get('user-agent') ?? ''
      await logEvent(admin, contract.id, 'consimtamant', { ip, ua })
      await logEvent(admin, contract.id, 'semnat', { ip, ua, semnatura_bytes: pngBytes.length })

      if (marketingOptin) {
        await admin.from('familii').update({ opt_out_marketing: false }).eq('id', contract.familie_id)
      }

      // finalize fire-and-forget: părintele primește răspunsul imediat
      const finalizeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/contract-finalize`
      fetch(finalizeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-contract-secret': Deno.env.get('CONTRACT_INTERNAL_SECRET') ?? '',
        },
        body: JSON.stringify({ contractId: contract.id }),
      }).catch((e) => console.error('finalize trigger fail:', e))

      return json({ ok: true, message: 'Documentul a fost semnat. Mulțumim!' })
    }

    return json({ error: 'action necunoscut' }, 400)
  } catch (e) {
    console.error('contract-public error:', e)
    return json({ error: 'Eroare internă.' }, 500)
  }
})
