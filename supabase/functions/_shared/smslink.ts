// Provider SMS pentru beta: smslink.ro (SMS Gateway HTTP API).
//
// API SMSLink — SMS Gateway (HTTP GET):
//   GET https://secure.smslink.ro/sms/gateway/communicate/index.php
//       ?connection_id={ID}&password={PASS}&to={07XXXXXXXX}&message={text}[&sender={...}]
//   Răspuns (semicolon-delimited):
//     succes:  MESSAGE;<variabile>;<message_id>;...
//     eroare:  ERROR;<cod>;<descriere>
//
// Credențiale (Connection ID + parolă generate în SMSLink → SMS Gateway →
// Configuration & Settings), din env: SMSLINK_CONNECTION_ID, SMSLINK_PASSWORD.
// Logica de stub / test-mode / allowlist NU e aici — rămâne în messaging.ts,
// care decide providerul; aici facem doar apelul HTTP concret.

import type { SendResult } from './messaging.ts'

const SMSLINK_BASE = 'https://secure.smslink.ro/sms/gateway/communicate/index.php'

export function getSmslinkCreds(): { connectionId: string; password: string } | null {
  const connectionId = Deno.env.get('SMSLINK_CONNECTION_ID')
  const password = Deno.env.get('SMSLINK_PASSWORD')
  if (!connectionId || !password) return null
  return { connectionId, password }
}

// SMSLink așteaptă numărul național 07XXXXXXXX. Normalizăm la ultimele 9 cifre
// (XXXXXXXXX, fără prefixul de țară) și prefixăm cu „0" → 07XXXXXXXX.
function toSmslinkPhone(p: string): string {
  const digits = p.replace(/\D/g, '').slice(-9)
  return `0${digits}`
}

export async function sendSmsSmslink(
  telefon: string,
  mesaj: string,
): Promise<SendResult> {
  const creds = getSmslinkCreds()
  if (!creds) {
    // Nu ar trebui să ajungem aici — messaging.ts comută pe stub fără credențiale.
    return { ok: false, stub: false, error: 'fără credențiale SMSLINK_*' }
  }

  const sender = Deno.env.get('SMSLINK_SENDER')
  const params = new URLSearchParams({
    connection_id: creds.connectionId,
    password: creds.password,
    to: toSmslinkPhone(telefon),
    message: mesaj,
  })
  if (sender) params.set('sender', sender)

  try {
    const res = await fetch(`${SMSLINK_BASE}?${params.toString()}`, {
      method: 'GET',
    })
    const text = (await res.text()).trim()

    // Succes: răspunsul începe cu „MESSAGE". Eroare: începe cu „ERROR;cod;desc".
    // Format succes: MESSAGE;<count>;<descriere>;<id>,<to>,<sender>
    if (res.ok && text.toUpperCase().startsWith('MESSAGE')) {
      const messageId = text.split(';')[3]?.split(',')[0]
      return { ok: true, stub: false, messageId, raw: text }
    }
    return { ok: false, stub: false, raw: text, error: text || `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, stub: false, error: String(e) }
  }
}
