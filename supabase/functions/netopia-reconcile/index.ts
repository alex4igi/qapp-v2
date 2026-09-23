// Edge Function (cron orar): întreabă Netopia ce s-a întâmplat cu comenzile rămase
// în așteptare (audit 2026-09-20, secțiunea 4.2).
//
// De ce: confirmarea plății vine DOAR prin IPN. Dacă IPN-ul se pierde (rețea, eroare
// la noi, retry epuizat), omul a plătit și în aplicație nu apare nicio încasare, iar
// comanda rămâne 'pending' la nesfârșit. Pe 2026-09-23 erau 6 comenzi așa, 4 de câte
// 290 RON din 12–16 septembrie.
//
// Cheia de interogare e `netopia_orders.ntp_id`, salvat de netopia-create-payment la
// pornirea plății: `/operation/status` cere ntpID, cu orderID singur răspunde „error 99:
// Invalid ntpID". Comenzile de dinainte de migrația `20260923120500` nu au ntp_id — apar
// în `fara_ntp_id` și se verifică manual în panoul Netopia.
//
// Procesăm exact ca webhookul (aceleași RPC-uri, idempotente):
//   plătită  → confirm_netopia_payment + factura FGO (dacă e pornită)
//   eșuată   → cancel_netopia_order (eliberează holdul de rezervare)
//   în curs  → o lăsăm, revenim peste o oră
// Când plata e bună dar comanda nu se poate finaliza (hold expirat, sumă diferită),
// anunțăm owner/admin prin notifica_plata_online_problema.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'
import { emitPortalInvoice } from '../_shared/portal-invoice.ts'
import { FAILED_STATUSES, SUCCESS_STATUSES, fetchNetopiaStatus } from '../_shared/netopia.ts'

// Sub 20 de minute plata poate fi încă în desfășurare (3DS, redirect bancă).
const MIN_AGE_MIN = 20
// Peste 30 de zile nu mai vine nimic; căutarea ar rula degeaba la nesfârșit.
const MAX_AGE_DAYS = 30

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // `{"simulare":true}` întreabă Netopia și raportează, fără să scrie nimic. Comenzile
  // vechi rămase în așteptare pot avea deja o încasare făcută la casă (client care a
  // reîncercat și a plătit cu cardul la studio) — pe alea le vede omul întâi.
  const body = await req.json().catch(() => ({}))
  const simulare = body?.simulare === true

  // `{"simulare":true,"ntp_id":"…"}` întreabă Netopia doar despre acel ntpID și raportează.
  // Nu atinge baza — sondă de verificat că interogarea de stare funcționează.
  if (simulare && typeof body?.ntp_id === 'string' && body.ntp_id) {
    const st = await fetchNetopiaStatus({ ntpID: body.ntp_id })
    if (!st.ok) return json({ sonda: body.ntp_id, ok: false, detail: st.detail })
    const status = Number(st.payment?.status)
    return json({
      sonda: body.ntp_id,
      ok: true,
      status,
      amount: st.payment?.amount,
      verdict: SUCCESS_STATUSES.has(status) ? 'plătită' : FAILED_STATUSES.has(status) ? 'eșuată' : 'în curs',
    })
  }

  const now = Date.now()
  const { data: orders, error } = await admin
    .from('netopia_orders')
    .select('order_ref, amount, created, ntp_id')
    .eq('status', 'pending')
    .lt('created', new Date(now - MIN_AGE_MIN * 60_000).toISOString())
    .gt('created', new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString())
    .order('created', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  const rezultat = {
    simulare,
    verificate: 0,
    confirmate: 0,
    anulate: 0,
    in_curs: 0,
    probleme: [] as string[],
    // Comenzi de dinainte ca `ntp_id` să fie salvat la pornirea plății: Netopia nu poate
    // fi întrebată de ele, se verifică manual în panou.
    fara_ntp_id: [] as string[],
    detalii: [] as { order_ref: string; status: number | null; verdict: string }[],
  }

  for (const o of orders ?? []) {
    if (!o.ntp_id) {
      rezultat.fara_ntp_id.push(o.order_ref)
      continue
    }
    rezultat.verificate++
    const st = await fetchNetopiaStatus({ ntpID: o.ntp_id })
    if (!st.ok) {
      // Netopia nu știe de comandă (omul n-a ajuns să plătească) sau API-ul e picat.
      // Nu e o problemă de bani: rămâne 'pending' și reîncercăm ora următoare.
      rezultat.in_curs++
      rezultat.detalii.push({
        order_ref: o.order_ref,
        status: null,
        // În simulare arătăm motivul: „Netopia nu știe de comandă" și „API-ul refuză
        // apelul" arată identic altfel, deși unul e liniștitor și celălalt e o defecțiune.
        verdict: simulare ? `fără răspuns — ${st.detail}` : 'fără răspuns',
      })
      continue
    }

    const status = Number(st.payment?.status)
    const verdict = SUCCESS_STATUSES.has(status)
      ? 'plătită'
      : FAILED_STATUSES.has(status)
      ? 'eșuată'
      : 'în curs'
    rezultat.detalii.push({ order_ref: o.order_ref, status, verdict })

    if (simulare) {
      if (verdict === 'plătită') rezultat.confirmate++
      else if (verdict === 'eșuată') rezultat.anulate++
      else rezultat.in_curs++
      continue
    }

    if (SUCCESS_STATUSES.has(status)) {
      const { data, error: rpcErr } = await admin.rpc('confirm_netopia_payment', {
        p_order_ref: o.order_ref,
        p_transaction_id: st.payment?.ntpID ?? o.order_ref,
        p_amount: Number(st.payment?.amount),
      })
      if (rpcErr) {
        rezultat.probleme.push(`${o.order_ref}: ${rpcErr.message}`)
        continue
      }
      if (data?.ok === false) {
        // Banii sunt la Netopia, dar noi nu putem scrie încasarea — asta trebuie văzută de om.
        await admin.rpc('notifica_plata_online_problema', {
          p_order_ref: o.order_ref,
          p_motiv: String(data.reason ?? 'necunoscut'),
        })
        rezultat.probleme.push(`${o.order_ref}: ${data.reason}`)
        continue
      }
      rezultat.confirmate++
      // Izolat ca în webhook: o eroare de facturare nu strică plata deja confirmată.
      try {
        await emitPortalInvoice(admin, o.order_ref)
      } catch (_e) { /* starea rămâne în facturi_fgo */ }
    } else if (FAILED_STATUSES.has(status)) {
      await admin.rpc('cancel_netopia_order', { p_order_ref: o.order_ref })
      rezultat.anulate++
    } else {
      rezultat.in_curs++
    }
  }

  return json(rezultat)
})
