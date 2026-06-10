// Edge Function: intake lead din formularul de pe quasardance.ro.
// Formularul face POST cu:
//   { nume, prenume?, nume_parinte?, telefon, email?, data_nasterii?,
//     interes?, grupa_varsta?, locatia?, mesaj?, campanie?,
//     utm_source?, utm_medium?, utm_campaign? }.
// Câmpurile aliniate 1:1 cu LeadModal (recepție) — widget-ul colectează aceleași
// date pe care le-ar introduce manual recepția.
// Validare:
//   - nume + telefon obligatorii; telefon trebuie să fie mobil RO valid → altfel 400.
//   - email invalid NU blochează: se ignoră (null) + `warnings:['email_invalid_ignorat']`.
//   - interes/locatia acceptă aliasurile site-ului (mapInteres/mapLocatie);
//     valorile nemapabile ajung în observații. grupa_varsta invalidă → null.
// Creează un lead în status 'nou'. Public (CORS *) — protejat doar de validare.
import {
  serviceClient,
  resolveCampanie,
  insertLead,
  isValidRoMobile,
  isValidEmail,
} from '../_shared/intake.ts'
import { sendEmail } from '../_shared/messaging.ts'
import { renderAutoReplyWidget } from '../_shared/email-templates.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Doar POST' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const nume = String(body.nume ?? '').trim()
    const telefon = String(body.telefon ?? '').trim()
    if (!nume || !telefon) {
      return json({ error: 'nume si telefon sunt obligatorii' }, 400)
    }
    if (nume.length < 2) {
      return json({ error: 'Nume invalid (prea scurt)' }, 400)
    }
    if (!isValidRoMobile(telefon)) {
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
    const emailRaw = String(body.email ?? '').trim()
    const emailValid = emailRaw ? isValidEmail(emailRaw) : true
    const emailFinal = emailValid ? (emailRaw || null) : null
    const warnings: string[] = []
    if (emailRaw && !emailValid) warnings.push('email_invalid_ignorat')

    const supabase = serviceClient()
    const campanieNume = String(
      body.campanie ?? 'Website quasardance.ro',
    ).trim()
    const sursaId = await resolveCampanie(supabase, campanieNume)

    const result = await insertLead(
      supabase,
      {
        nume,
        prenume: body.prenume ?? null,
        nume_parinte: body.nume_parinte ?? null,
        telefon,
        email: emailFinal,
        data_nasterii: body.data_nasterii ?? null,
        interes: body.interes ?? null,
        grupa_varsta: body.grupa_varsta ?? null,
        locatia: body.locatia ?? null,
        observatii: body.mesaj ?? null,
        utm_source: body.utm_source ?? null,
        utm_medium: body.utm_medium ?? null,
        utm_campaign: body.utm_campaign ?? null,
      },
      sursaId,
    )

    console.log(
      `[intake/website] ${result.created ? 'creat' : 'skip'} ${result.reason ?? ''}`,
    )

    // Auto-reply email (fire-and-forget — nu blochează response-ul widget).
    // Doar pentru lead-uri NOI cu email valid — nu re-trimitem la dedup.
    const emailDestinatar = emailFinal ?? ''
    if (result.created && emailDestinatar && result.leadId) {
      const numePentruSalut = String(body.prenume ?? body.nume ?? '').trim() || null
      const rendered = renderAutoReplyWidget(numePentruSalut)
      sendEmail({
        to: emailDestinatar,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
        .then(async (res) => {
          await supabase.from('email_logs').insert({
            lead_id: result.leadId,
            to_email: emailDestinatar,
            tip: 'auto_reply_widget',
            subject: rendered.subject,
            status: res.stub ? 'stub' : res.ok ? 'trimis' : 'esuat',
            message_id: res.messageId ?? null,
            error: res.error ?? null,
          })
        })
        .catch((e) => {
          console.error('[intake/website] auto-reply email error:', e)
        })
    }

    return json(warnings.length ? { ...result, warnings } : result)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
