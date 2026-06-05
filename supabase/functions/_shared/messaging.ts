// Wrapper unificat pentru SMS + Email — backend themarketer.com (transactional API).
//
// API themarketer transactional:
//   POST https://t.themarketer.com/api/v1/transactional/send-sms?k={REST_KEY}&u={CUSTOMER_ID}
//     body: { to: "+40...", content: "..." }
//   POST https://t.themarketer.com/api/v1/transactional/send-email?k={REST_KEY}&u={CUSTOMER_ID}
//     body: { to, subject, from, body, reply_to?, bcc?, attachments? }
//
// Strategie cost (vezi planul B0.5):
//   - NU sincronizăm contacte cu Audience themarketer. Audience size = 0 → Free plan permanent.
//   - Toate apelurile sunt transactional 1-la-1, taxate per mesaj trimis.
//   - Cost SMS: 0.037 €/SMS (vs 0.049 €/SMS smslink legacy). Cost Email: ~10 €/10k.
//
// Sandbox mode: themarketer pornește în sandbox; SMS doar la numerele din lista
// configurată în dashboard până activăm production + adăugăm credit. Email blocat
// până validăm domeniul `quasardance.ro` (SPF + DKIM + DMARC).
//
// Stub mode automat: dacă lipsesc THEMARKETER_REST_KEY sau THEMARKETER_CUSTOMER_ID,
// logăm și returnăm success simulat. Util pentru dezvoltare locală + CI.

const TM_BASE = 'https://t.themarketer.com/api/v1/transactional'

export type MessageType = 'tranzactional' | 'marketing'

export type SendResult = {
  ok: boolean
  stub: boolean
  testMode?: boolean
  messageId?: string
  raw?: string
  error?: string
  skipped?: boolean
  skipReason?: string
}

// Normalizează un număr la ultimele 9 cifre (consistent cu sms.ts legacy).
function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').slice(-9)
}

// Lista de allowlist SMS pentru testare (numere care primesc SMS real în mod dezvoltare).
function isInAllowlist(telefon: string): boolean {
  const allowlist = Deno.env.get('SMS_TEST_ALLOWLIST')
  if (!allowlist || !allowlist.trim()) return true // fără allowlist = toți pot primi
  const allowed = allowlist.split(',').map((n) => normalizePhone(n.trim()))
  return allowed.includes(normalizePhone(telefon))
}

function getCreds(): { restKey: string; customerId: string } | null {
  const restKey = Deno.env.get('THEMARKETER_REST_KEY')
  const customerId = Deno.env.get('THEMARKETER_CUSTOMER_ID')
  if (!restKey || !customerId) return null
  return { restKey, customerId }
}

// ============================================================
// sendSms
// ============================================================

export async function sendSms(
  telefon: string,
  mesaj: string,
  _type: MessageType = 'tranzactional',
): Promise<SendResult> {
  const creds = getCreds()
  const testMode = Deno.env.get('SMS_TEST_MODE') === '1'

  let stubReason: string | null = null
  if (!creds) {
    stubReason = 'fără credențiale THEMARKETER_*'
  } else if (!isInAllowlist(telefon)) {
    stubReason = 'număr în afara allowlist-ului de test'
  } else if (testMode) {
    stubReason = 'SMS_TEST_MODE=1'
  }

  if (stubReason) {
    console.log(`[SMS stub: ${stubReason}] → ${telefon}: ${mesaj}`)
    return { ok: true, stub: true, testMode: stubReason === 'SMS_TEST_MODE=1' }
  }

  try {
    const url = `${TM_BASE}/send-sms?k=${encodeURIComponent(creds!.restKey)}&u=${encodeURIComponent(creds!.customerId)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: telefon, content: mesaj }),
    })
    const text = await res.text()
    let parsed: { result?: string; message?: string; message_id?: string } = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      // răspuns non-JSON; păstrăm text raw
    }

    if (res.ok && parsed.result === 'success') {
      return { ok: true, stub: false, messageId: parsed.message_id, raw: text }
    }
    return { ok: false, stub: false, raw: text, error: parsed.message ?? text }
  } catch (e) {
    return { ok: false, stub: false, error: String(e) }
  }
}

// ============================================================
// sendEmail
// ============================================================

export type EmailParams = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  fromOverride?: string // dacă vrei alt expeditor decât EMAIL_FROM
}

export async function sendEmail(
  params: EmailParams,
  _type: MessageType = 'tranzactional',
): Promise<SendResult> {
  const creds = getCreds()
  const from = params.fromOverride || Deno.env.get('EMAIL_FROM') || 'noreply@quasardance.ro'
  const replyTo = params.replyTo || Deno.env.get('EMAIL_REPLY_TO') || undefined
  const testMode = Deno.env.get('EMAIL_TEST_MODE') === '1'

  let stubReason: string | null = null
  if (!creds) {
    stubReason = 'fără credențiale THEMARKETER_*'
  } else if (testMode) {
    stubReason = 'EMAIL_TEST_MODE=1'
  }

  if (stubReason) {
    console.log(
      `[EMAIL stub: ${stubReason}] → ${params.to}: ${params.subject}`,
    )
    return { ok: true, stub: true, testMode: stubReason === 'EMAIL_TEST_MODE=1' }
  }

  try {
    const url = `${TM_BASE}/send-email?k=${encodeURIComponent(creds!.restKey)}&u=${encodeURIComponent(creds!.customerId)}`
    const body: Record<string, string> = {
      to: params.to,
      subject: params.subject,
      from,
      body: params.html,
    }
    if (replyTo) body.reply_to = replyTo

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let parsed: { result?: string; message?: string; message_id?: string } = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      // răspuns non-JSON; păstrăm raw
    }

    if (res.ok && parsed.result === 'success') {
      return { ok: true, stub: false, messageId: parsed.message_id, raw: text }
    }
    return { ok: false, stub: false, raw: text, error: parsed.message ?? text }
  } catch (e) {
    return { ok: false, stub: false, error: String(e) }
  }
}
