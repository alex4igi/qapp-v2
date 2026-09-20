// Edge Function: intake lead din formularul de pe quasardance.ro.
// Formularul face POST cu:
//   { nume, prenume?, nume_parinte?, telefon, email?, data_nasterii?,
//     interes?, grupa_varsta?, locatia?, mesaj?, campanie?,
//     utm_source?, utm_medium?, utm_campaign?, gclid?, campaign_id? }.
// `gclid` = click id-ul Google Ads (îl pune Google în URL-ul de landing). E
// precondiția pentru upload de conversii offline înapoi în Google Ads — site-ul
// trebuie să-l preia din query string și să-l trimită aici.
// Câmpurile aliniate 1:1 cu LeadModal (recepție) — widget-ul colectează aceleași
// date pe care le-ar introduce manual recepția.
// Validare:
//   - nume + telefon obligatorii; telefon trebuie să fie mobil RO valid → altfel 400.
//   - email invalid NU blochează: se ignoră (null) + `warnings:['email_invalid_ignorat']`.
//   - interes/locatia acceptă aliasurile site-ului (mapInteres/mapLocatie);
//     valorile nemapabile ajung în observații. grupa_varsta invalidă → null.
// Creează un lead în status 'nou'.
//
// ACCES: singurul apelant legitim e serverul site-ului (`/api/inscriere`), care trimite
// `x-intake-secret` = INTAKE_SECRET. Widgetul embeddabil (public/qleads-widget.js) e
// parcat — nu mai există apelant din browser.
//   INTAKE_REQUIRE_SECRET != 'true' → fereastră de rollout: apelurile fără secret trec,
//     dar sunt marcate în `leads_intake_log.detalii->fara_secret`, cu Origin/Referer, ca
//     să vedem dacă a mai rămas vreun apelant necunoscut. CORS-ul e încă deschis.
//   INTAKE_REQUIRE_SECRET = 'true' → fără secret = 403, CORS închis. Revenirea la
//     fereastră = ștergerea secretului-comutator, fără redeploy.
import {
  serviceClient,
  resolveCampanie,
  insertLead,
  isValidRoMobile,
  isValidEmail,
  logIntake,
} from '../_shared/intake.ts'
import { clientIp, raspuns429, verificaPlafon } from '../_shared/rateLimit.ts'

const SECRET = Deno.env.get('INTAKE_SECRET') ?? ''
const REQUIRE_SECRET = Deno.env.get('INTAKE_REQUIRE_SECRET') === 'true'

// CORS-ul există doar cât timp mai e posibil un apelant din browser.
const cors: Record<string, string> = REQUIRE_SECRET ? {} : {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-intake-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// O familie care înscrie doi copii trimite două formulare; 5 la 10 minute e larg pentru
// om și strâmt pentru un script.
const PLAFON = { fereastraSec: 600, limita: 5 }

// Plafoanele erau doar în serverul site-ului; endpoint-ul le repetă, fiindcă el e granița.
const MAX_SCURT = 200
const MAX_MESAJ = 1000
const cap = (v: unknown, max: number): string | null => {
  const t = String(v ?? '').trim()
  return t ? t.slice(0, max) : null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (REQUIRE_SECRET) return json({ error: 'Doar POST' }, 405)
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') return json({ error: 'Doar POST' }, 405)

  const areSecret = SECRET !== '' && req.headers.get('x-intake-secret') === SECRET
  if (REQUIRE_SECRET && !areSecret) return json({ error: 'Forbidden' }, 403)

  // Urma apelurilor fără secret: detectorul care spune dacă mai există vreun apelant
  // din browser înainte să punem obligativitatea.
  const urma = areSecret ? undefined : {
    fara_secret: true,
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
  }

  const supabasePlafon = serviceClient()
  const ip = clientIp(req, areSecret)
  const plafon = await verificaPlafon(supabasePlafon, 'intake-website', ip, PLAFON)
  if (!plafon.permis) return raspuns429(plafon.retryAfter, cors)

  try {
    const body = await req.json().catch(() => ({}))
    const nume = cap(body.nume, MAX_SCURT) ?? ''
    const telefon = cap(body.telefon, MAX_SCURT) ?? ''
    const supabase = supabasePlafon

    // Submisiile respinse se loghează: altfel „am trimis X formulare, voi aveți
    // Y lead-uri" nu se poate explica. Fără PII — doar motivul + atribuirea.
    const respins = (motiv: string) =>
      logIntake(supabase, {
        canal: 'website',
        rezultat: 'respins_validare',
        lead: {
          nume: '',
          utm_source: body.utm_source ?? null,
          utm_medium: body.utm_medium ?? null,
          utm_campaign: body.utm_campaign ?? null,
          campaign_id: body.campaign_id ?? null,
          platform: body.utm_source ?? null,
        },
        detalii: { ...(urma ?? {}), motiv },
      })

    if (!nume || !telefon) {
      await respins('nume sau telefon lipsă')
      return json({ error: 'nume si telefon sunt obligatorii' }, 400)
    }
    if (nume.length < 2) {
      await respins('nume prea scurt')
      return json({ error: 'Nume invalid (prea scurt)' }, 400)
    }
    if (!isValidRoMobile(telefon)) {
      await respins('telefon nu e mobil RO')
      return json(
        {
          error:
            'Număr de telefon invalid. Folosește un număr de mobil românesc (ex: 07XXXXXXXX).',
          field: 'telefon',
        },
        400,
      )
    }

    // Email: best-effort — un email greșit NU pierde lead-ul, doar îl ignorăm.
    const emailRaw = cap(body.email, MAX_SCURT) ?? ''
    const emailValid = emailRaw ? isValidEmail(emailRaw) : true
    const emailFinal = emailValid ? (emailRaw || null) : null
    const warnings: string[] = []
    if (emailRaw && !emailValid) warnings.push('email_invalid_ignorat')

    const campanieNume = cap(body.campanie, MAX_SCURT) ?? 'Website quasardance.ro'
    const sursaId = await resolveCampanie(supabase, campanieNume)

    const result = await insertLead(
      supabase,
      {
        nume,
        prenume: cap(body.prenume, MAX_SCURT),
        nume_parinte: cap(body.nume_parinte, MAX_SCURT),
        telefon,
        email: emailFinal,
        data_nasterii: cap(body.data_nasterii, 40),
        interes: cap(body.interes, MAX_SCURT),
        grupa_varsta: cap(body.grupa_varsta, MAX_SCURT),
        locatia: cap(body.locatia, MAX_SCURT),
        observatii: cap(body.mesaj, MAX_MESAJ),
        utm_source: cap(body.utm_source, MAX_SCURT),
        utm_medium: cap(body.utm_medium, MAX_SCURT),
        utm_campaign: cap(body.utm_campaign, MAX_SCURT),
        platform: cap(body.utm_source, MAX_SCURT),
        campaign_id: cap(body.campaign_id, MAX_SCURT),
        gclid: cap(body.gclid, MAX_SCURT),
      },
      sursaId,
      { canal: 'website', detalii: urma },
    )

    console.log(
      `[intake/website] ${result.created ? 'creat' : 'skip'} ${result.reason ?? ''}`,
    )

    // Auto-reply email DEZACTIVAT intenționat: site-ul quasardance.ro trimite deja
    // propriul email de confirmare la submisia formularului. Un al doilea email de la
    // noi ar dubla mesajul. Capabilitatea există în _shared/messaging.ts (sendEmail)
    // dacă vreodată mutăm confirmarea în aplicație.

    // `created` spune dacă telefonul e deja în CRM — merge doar către serverul site-ului,
    // niciodată către un apelant anonim.
    if (!areSecret) return json({ ok: true })
    return json(warnings.length ? { ...result, warnings } : result)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
