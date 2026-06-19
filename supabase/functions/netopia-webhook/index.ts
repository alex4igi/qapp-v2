// Edge Function: webhook IPN Netopia (Payments API v2). PUBLIC (verify_jwt=false) —
// Netopia POST-ează `{ order, payment }` cu un header `Verification-token` (JWT semnat de
// Netopia). Verificăm autenticitatea (ca în SDK-ul oficial):
//   - iss == "NETOPIA Payments"
//   - aud conține POS signature-ul contului nostru
//   - sub == base64(sha512(body brut))  → leagă token-ul de exact acest body
//   - semnătura RSA (RS512) cu cheia publică Netopia — STRICT pe `live`.
//     Pe `sandbox`, dacă semnătura nu se poate verifica (cheia publică corectă lipsește),
//     acceptăm pe baza verificărilor de integritate de mai sus (doar pt testare).
//
// IDEMPOTENT: confirmarea scrie `incasari` o singură dată (dedup pe transaction id în
// confirm_netopia_payment). Răspundem cu { errorCode: 0 } ca Netopia să nu reîncerce.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// v2 payment.status (constante din SDK-ul oficial netopia-payment2):
// 3 = paid, 5 = confirmed (banii s-au mișcat) => confirmăm (idempotent).
const SUCCESS_STATUSES = new Set([3, 5])
// Stări TERMINALE de eșec/anulare => anulăm comanda + eliberăm holdul de rezervare.
// 4 = canceled, 11 = error, 12 = declined, 13 = fraud, 17 = reversed, 23 = expired.
const FAILED_STATUSES = new Set([4, 11, 12, 13, 17, 23])
// Orice altă stare (1 new, 2 opened, 6 pending, 7 scheduled, 14 pending_auth, 15 3ds,
// 18 pending_any, …) = tranzacție în desfășurare => lăsăm comanda 'pending', dar confirmăm primirea.

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ errorCode: 1 }, 405)

    const raw = await req.text()
    const verifyToken = req.headers.get('Verification-token') ?? req.headers.get('verification-token')

    const v = await verifyIpn(raw, verifyToken)
    if (!v.ok) return json({ errorCode: 1, error: v.reason ?? 'invalid notification' }, 401)

    const payload = JSON.parse(raw) as {
      order?: { orderID?: string }
      payment?: { ntpID?: string; status?: number; amount?: number }
    }
    const orderRef = payload.order?.orderID
    const txId = payload.payment?.ntpID
    const status = Number(payload.payment?.status)
    const amount = Number(payload.payment?.amount)
    if (!orderRef) return json({ errorCode: 1, error: 'missing orderID' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (SUCCESS_STATUSES.has(status)) {
      const { data, error } = await admin.rpc('confirm_netopia_payment', {
        p_order_ref: orderRef,
        p_transaction_id: txId ?? orderRef,
        p_amount: amount,
      })
      if (error) return json({ errorCode: 1, error: error.message }, 500)
      if (data?.ok === false) return json({ errorCode: 1, reason: data.reason }, 400)
    } else if (FAILED_STATUSES.has(status)) {
      // anulează comanda + eliberează holdul de rezervare (dacă există)
      await admin.rpc('cancel_netopia_order', { p_order_ref: orderRef })
    }
    // alte stări (new/pending/3ds) → lăsăm comanda 'pending', dar confirmăm primirea.

    return json({ errorCode: 0 })
  } catch (e) {
    return json({ errorCode: 1, error: String(e) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Verificarea IPN-ului
// ─────────────────────────────────────────────────────────────────────────────
async function verifyIpn(raw: string, jwt: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!jwt) return { ok: false, reason: 'missing token' }
  const parts = jwt.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' }
  const [h, p, s] = parts

  let payload: { iss?: string; aud?: unknown; sub?: string }
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
  } catch {
    return { ok: false, reason: 'bad payload' }
  }

  if (payload.iss !== 'NETOPIA Payments') return { ok: false, reason: 'bad issuer' }

  const pos = Deno.env.get('NETOPIA_POS_SIGNATURE')
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (pos && !aud.includes(pos)) return { ok: false, reason: 'bad audience' }

  // sub == base64(sha512(body brut)) — leagă token-ul de acest body exact
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(raw))
  const subExpected = bytesToB64Std(new Uint8Array(digest))
  if (payload.sub !== subExpected) return { ok: false, reason: 'body hash mismatch' }

  // Semnătura RSA (RS512/RS256) cu cheia publică de notificare Netopia (NETOPIA_PUBLIC_KEY).
  // STRICT: obligatorie în orice mediu. (Escape-hatch explicit DOAR dacă owner-ul setează
  // NETOPIA_IPN_ALLOW_UNSIGNED=true — de evitat; nu e activat automat pe sandbox.)
  const sigOk = await verifyRsaSignature(`${h}.${p}`, s)
  if (sigOk) return { ok: true }
  if (Deno.env.get('NETOPIA_IPN_ALLOW_UNSIGNED') === 'true') {
    return { ok: true, reason: 'unsigned-allowed' }
  }
  return { ok: false, reason: 'invalid signature' }
}

async function verifyRsaSignature(signingInput: string, sigPart: string): Promise<boolean> {
  const pem = Deno.env.get('NETOPIA_PUBLIC_KEY')
  if (!pem) return false
  const data = new TextEncoder().encode(signingInput)
  const sig = b64urlToBytes(sigPart)
  for (const hash of ['SHA-512', 'SHA-256']) {
    try {
      const key = await importSpki(pem, hash)
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)) return true
    } catch {
      // încearcă următorul algoritm / cheie incompatibilă
    }
  }
  return false
}

async function importSpki(pem: string, hash: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify'])
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function bytesToB64Std(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
