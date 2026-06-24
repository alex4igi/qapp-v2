// Edge function de test pentru conectivitate themarketer.
// POST cu { tip: 'sms'|'email', to: '+40...' sau 'email@...' }
//
// Folosit doar pentru smoke-test inițial. Necesită auth (JWT) — doar admin.

import { sendSms, sendEmail } from '../_shared/messaging.ts'
import { renderAutoReplyWidget } from '../_shared/email-templates.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const tip = String(body.tip ?? '').trim()
    const to = String(body.to ?? '').trim()
    const providerRaw = String(body.provider ?? '').trim()
    const provider = providerRaw === 'themarketer' || providerRaw === 'smslink'
      ? providerRaw
      : undefined
    if (!to) return json({ error: 'lipsește "to"' }, 400)

    if (tip === 'sms') {
      const result = await sendSms(
        to,
        'Test Quasar Dance: connectivitate themarketer OK.',
        { provider },
      )
      return json(result)
    }

    if (tip === 'email') {
      const rendered = renderAutoReplyWidget('Igi')
      const result = await sendEmail({
        to,
        subject: '[TEST] ' + rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
      return json(result)
    }

    return json({ error: "tip trebuie să fie 'sms' sau 'email'" }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
