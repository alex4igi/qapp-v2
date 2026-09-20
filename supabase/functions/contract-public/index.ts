// Edge Function PUBLICĂ (verify_jwt=false): pagina de semnare din portal.
//
// action='load'   → validează tokenul, marchează prima deschidere, întoarce
//                   definițiile câmpurilor + precompletările + signed URL preview.
// action='status'   → starea documentului (pagina așteaptă finalizarea după semnare).
// action='download' → documentul semnat, ca signed URL scurt din bucketul privat.
//                   Linkul din SMS e calea părintelui spre propriul contract după
//                   semnare (Drive-ul intern e 401 pentru el), dar DOAR ZILE_DESCARCARE_LINK
//                   zile; după aceea documentul rămâne în portal, la Documente.
// action='submit' → validează, salvează valori + semnătură ATOMIC (guard pe status),
//                   upsert profil semnare, loghează consimțământ + semnat (IP/UA),
//                   declanșează contract-finalize (fire-and-forget).
//
// Securitate: clientul nu primește niciodată date fără token valid; căutarea se face
// pe sha256(token) în `contract_tokens` (tabel doar service_role); IP + user-agent
// intră în jurnalul probatoriu.
//
// Linkul e un secret purtat prin SMS/email: se poate redirecționa, poate rămâne în
// istoricul telefonului, poate ajunge la altcineva. De-aia pagina NU mai trimite
// CNP-ul și seria/numărul CI în clar (doar o mască — valoarea reală se ia din
// `familii_date_semnatar` la semnare), nu mai listează frații cursantului și nu mai
// dă documentul semnat la nesfârșit.
import {
  clientIp,
  isValidCnp,
  logEvent,
  pdfFileName,
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

// Cât timp după finalizare mai merge descărcat documentul de pe linkul public.
// După aceea rămâne în portal (Documente), în spatele login-ului.
const ZILE_DESCARCARE_LINK = 90

// Câmpurile care NU pleacă în clar către pagina publică. Valoarea reală rămâne în
// `familii_date_semnatar` și e pusă înapoi la semnare (vezi completeazaMascate).
const SURSE_MASCATE = ['familie.cnp', 'familie.ci']

function mascheazaCnp(v: string): string {
  const d = v.replace(/\D/g, '')
  return d.length >= 4 ? `•••••••••${d.slice(-4)}` : '•••••••••••••'
}

function mascheazaCi(v: string): string {
  const serie = (v.trim().match(/^[A-Za-z]{1,2}/)?.[0] ?? '').toUpperCase()
  const nr = v.replace(/\D/g, '')
  return `${serie} ••••${nr.slice(-2)}`.trim()
}

function esteEditabil(f: TemplateField): boolean {
  return f.editable ?? f.source === 'manual'
}

type ContractRow = {
  id: string
  status: string
  token_expira_la: string | null
  familie_id: string
  client_id: string | null
  valori: Record<string, unknown> | null
  template_id: string
  deschis_prima_data_la: string | null
  pdf_storage_path: string | null
  semnat_la: string | null
  finalizat_la: string | null
}

// Fereastra de descărcare curge de la finalizare; `semnat_la` e plasa de siguranță
// pentru contractele vechi, finalizate înainte ca `finalizat_la` să se scrie.
function descarcareExpirata(c: ContractRow): boolean {
  const reper = c.finalizat_la ?? c.semnat_la
  if (!reper) return false
  return Date.now() - new Date(reper).getTime() > ZILE_DESCARCARE_LINK * 86_400_000
}

async function findByToken(admin: ReturnType<typeof serviceClient>, token: string) {
  const tokenHash = await sha256Hex(token)
  const { data } = await admin
    .from('contract_tokens')
    .select('contracte(id, status, token_expira_la, familie_id, client_id, valori, template_id, deschis_prima_data_la, pdf_storage_path, semnat_la, finalizat_la)')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  return (data?.contracte ?? null) as ContractRow | null
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
  // cheie → mască de afișat („•••••••••1234"); valoarea reală nu pleacă din server
  const mascate: Record<string, string> = {}
  for (const f of fields) {
    switch (f.source) {
      case 'familie.reprezentant': prefill[f.key] = reprezentant; break
      case 'familie.telefon': prefill[f.key] = familie?.telefon ?? ''; break
      case 'familie.email': prefill[f.key] = familie?.email ?? ''; break
      case 'familie.cnp': {
        // Pe un câmp editabil masca n-are ce căuta în input (părintele ar semna cu
        // buline): trimitem gol, iar masca merge separat, ca indiciu de verificare.
        const real = profil?.cnp ?? ''
        if (real) mascate[f.key] = mascheazaCnp(real)
        prefill[f.key] = real && !esteEditabil(f) ? mascate[f.key] : ''
        break
      }
      case 'familie.adresa': prefill[f.key] = profil?.adresa ?? ''; break
      case 'familie.ci': {
        const real = profil?.ci_serie
          ? `${profil.ci_serie} ${profil.ci_numar ?? ''}`.trim()
          : ''
        if (real) mascate[f.key] = mascheazaCi(real)
        prefill[f.key] = real && !esteEditabil(f) ? mascate[f.key] : ''
        break
      }
      case 'copil.nume': {
        const copil = copii?.find((c) => c.id === contract.client_id) ?? copii?.[0]
        prefill[f.key] = copil ? `${copil.nume} ${copil.prenume ?? ''}`.trim() : ''
        break
      }
      case 'azi': prefill[f.key] = new Date().toISOString().slice(0, 10); break
      case 'manual': break
    }
  }
  // Un contract pe un copil nu are de ce să spună linkului cine sunt frații lui.
  // Data nașterii nu se folosește în pagină (PDF-ul o ia din DB la finalizare).
  const deAratat = contract.client_id
    ? (copii ?? []).filter((c) => c.id === contract.client_id)
    : (copii ?? [])

  return {
    prefill,
    mascate,
    profilExistent: !!profil?.cnp,
    copii: deAratat.map((c) => ({
      id: c.id,
      nume: `${c.nume} ${c.prenume ?? ''}`.trim(),
    })),
  }
}

// Pune la loc valorile mascate înainte de validare și salvare: dacă părintele n-a
// scris nimic (sau a trimis înapoi masca), contractul se semnează cu datele din fișă.
async function completeazaMascate(
  admin: ReturnType<typeof serviceClient>,
  contract: ContractRow,
  fields: TemplateField[],
  valori: Record<string, unknown>,
): Promise<void> {
  const deCompletat = fields.filter((f) => SURSE_MASCATE.includes(f.source))
  if (!deCompletat.length) return
  const { data: profil } = await admin
    .from('familii_date_semnatar')
    .select('cnp, ci_serie, ci_numar')
    .eq('familie_id', contract.familie_id)
    .maybeSingle()
  if (!profil) return
  for (const f of deCompletat) {
    const trimis = String(valori[f.key] ?? '').trim()
    if (trimis && !trimis.includes('•')) continue // părintele a scris o valoare nouă
    const real = f.source === 'familie.cnp'
      ? (profil.cnp ?? '')
      : profil.ci_serie
        ? `${profil.ci_serie} ${profil.ci_numar ?? ''}`.trim()
        : ''
    if (real) valori[f.key] = real
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
    // Linkurile înlocuite de remindere până la 2026-09-15 nu mai pot fi recuperate.
    if (!contract) {
      return json({
        error: 'Linkul nu mai este valid. Deschideți cel mai recent mesaj primit de la Quasar Dance sau cereți recepției să vi-l retrimită.',
      }, 404)
    }

    // Starea documentului, pentru pagina care așteaptă finalizarea după semnare.
    // Separată de 'download' ca să nu semneze URL-uri și să nu umple jurnalul cu
    // descărcări care nu s-au întâmplat.
    if (body.action === 'status') {
      const expirat = descarcareExpirata(contract)
      return json({
        status: contract.status,
        ready: contract.status === 'finalizat' && !!contract.pdf_storage_path && !expirat,
        descarcareExpirata: expirat,
      })
    }

    // Descărcarea propriului document semnat. Stă înaintea gardurilor de mai jos:
    // un contract finalizat nu mai e „disponibil pentru semnare", dar exact atunci
    // trebuie să poată fi luat acasă.
    if (body.action === 'download') {
      if (!['semnat', 'finalizat'].includes(contract.status)) {
        return json({ error: 'Documentul nu este semnat.' }, 409)
      }
      // 'semnat' = finalizarea (PDF + arhivare) încă rulează; pagina reîncearcă.
      if (contract.status === 'semnat' || !contract.pdf_storage_path) {
        return json({ pending: true })
      }
      if (descarcareExpirata(contract)) {
        return json({
          descarcareExpirata: true,
          error: `Linkul de descărcare a fost valabil ${ZILE_DESCARCARE_LINK} de zile de la semnare. Documentul te așteaptă în contul tău de membru, la Documente.`,
        }, 410)
      }
      const { data: tplNume } = await admin
        .from('contract_templates')
        .select('nume')
        .eq('id', contract.template_id)
        .single()
      const fisier = pdfFileName(tplNume?.nume)
      const { data: signed } = await admin.storage
        .from('contracte')
        .createSignedUrl(contract.pdf_storage_path, 300, { download: fisier })
      if (!signed?.signedUrl) return json({ error: 'Documentul nu poate fi descărcat acum.' }, 500)
      await logEvent(admin, contract.id, 'descarcat', {
        ip: clientIp(req), ua: req.headers.get('user-agent') ?? '', canal: 'link_semnare',
      })
      return json({ url: signed.signedUrl })
    }

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
      const expirat = descarcareExpirata(contract)
      return json({
        alreadySigned: true,
        canDownload: contract.status === 'finalizat' && !!contract.pdf_storage_path && !expirat,
        descarcareExpirata: expirat,
        message: 'Documentul a fost deja semnat. Mulțumim!',
      })
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

      const { prefill, mascate, profilExistent, copii } = await buildPrefill(admin, contract, fields)

      return json({
        contract: { nume: tpl.nume, tip: tpl.tip },
        fields: fields.map((f) => ({
          key: f.key, label: f.label, type: f.type,
          required: f.required ?? false,
          editable: f.editable ?? f.source === 'manual',
          source: f.source,
        })),
        prefill,
        mascate,
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

      await completeazaMascate(admin, contract, fields, valori)

      for (const f of fields) {
        if (f.type === 'signature' || f.type === 'copii_table') continue
        const val = valori[f.key]
        // checkbox: „obligatoriu" înseamnă bifat (=== true), nu doar „nu e gol" —
        // altfel valoarea booleană `false` (nebifat) ar trece ca prezentă.
        if (f.type === 'checkbox') {
          if (f.required && val !== true) {
            return json({ error: `Câmpul „${f.label}" trebuie bifat.` }, 400)
          }
          continue
        }
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
