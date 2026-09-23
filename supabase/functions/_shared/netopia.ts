// Interogarea stării unei plăți la Netopia (Payments API v2, `/operation/status`).
// Folosită de `netopia-webhook` (notificări compacte, fără orderID) și de
// `netopia-reconcile` (comenzi rămase în așteptare, fără ntpID).
//
// Producția e pe secure.mobilpay.ro/pay — vezi comentariul din netopia-create-payment.

export type NetopiaPayment = { ntpID?: string; status?: number; amount?: number }
export type NetopiaStatusResult =
  | { ok: true; order?: { orderID?: string }; payment?: NetopiaPayment }
  | { ok: false; detail: string }

// v2 payment.status (constante din SDK-ul oficial netopia-payment2):
// 3 = paid, 5 = confirmed (banii s-au mișcat).
export const SUCCESS_STATUSES = new Set([3, 5])
// Stări TERMINALE de eșec/anulare: 4 canceled, 11 error, 12 declined, 13 fraud,
// 17 reversed, 23 expired. Orice altceva (1 new, 6 pending, 14 pending_auth, 15 3ds…)
// = tranzacție în desfășurare.
export const FAILED_STATUSES = new Set([4, 11, 12, 13, 17, 23])

export function netopiaBase(): string {
  return (Deno.env.get('NETOPIA_ENV') ?? 'sandbox') === 'live'
    ? 'https://secure.mobilpay.ro/pay'
    : 'https://secure-sandbox.netopia-payments.com'
}

/** Starea unei plăți, după `ntpID` (din IPN) sau după `orderID` (comanda noastră). */
export async function fetchNetopiaStatus(
  by: { ntpID?: string; orderID?: string },
): Promise<NetopiaStatusResult> {
  const res = await fetch(`${netopiaBase()}/operation/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: Deno.env.get('NETOPIA_API_KEY')! },
    body: JSON.stringify({
      posID: Deno.env.get('NETOPIA_POS_SIGNATURE') ?? '',
      ntpID: by.ntpID ?? '',
      orderID: by.orderID ?? '',
    }),
  })
  const text = await res.text()
  let data: { order?: { orderID?: string }; payment?: NetopiaPayment } | null = null
  try { data = JSON.parse(text) } catch { /* non-JSON */ }
  if (!res.ok || !data?.order?.orderID) {
    return { ok: false, detail: `status ${res.status}: ${text.slice(0, 300)}` }
  }
  // ntpID din răspuns poate lipsi — păstrăm id-ul cerut ca fallback de dedup
  if (by.ntpID) data.payment = { ntpID: by.ntpID, ...data.payment }
  return { ok: true, order: data.order, payment: data.payment }
}
