// Edge Function: inițiază o plată online Netopia (Payments API v2) pentru un membru
// al portalului (rol `parinte`). Recalculează restanța FIFO server-side (sursa de adevăr
// a sumei — clientul NU o trimite), creează un rând `netopia_orders` (pending) și întoarce
// URL-ul de redirecționare spre pagina de plată Netopia.
//
// Confirmarea efectivă (scrierea în `incasari`) se face DOAR din `netopia-webhook`.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as jose from 'npm:jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Netopia v2 — endpoint card/start (sandbox vs live după NETOPIA_ENV).
// Producția e pe secure.mobilpay.ro/pay (verificat empiric + doc oficială).
// secure.netopia-payments.com e SITE-ul de prezentare (redirect 302 → HTML),
// NU API-ul — folosit greșit înainte, plata primea HTML în loc de JSON.
const NETOPIA_BASE = (Deno.env.get('NETOPIA_ENV') ?? 'sandbox') === 'live'
  ? 'https://secure.mobilpay.ro/pay'
  : 'https://secure-sandbox.netopia-payments.com'

type Body = {
  clientId: string
  kind?: 'abonament' | 'rezervare' | 'bilet'
  sesiuneId?: string
  // bilet: evenimentul pentru care se cumpără + câte bilete (preț server-side din eveniment).
  evenimentId?: string
  qty?: number
  // abonament: plătește restanța până la (și inclusiv) această înrolare/lună (FIFO);
  // null => toată restanța. Garda cronologică e validată server-side în RPC.
  panaLa?: string
  // abonament: datorii one-off (Bilet/Merch/Taxă) selectate — fiecare se plătește INTEGRAL.
  datorii?: string[]
  // abonament: include înrolările în plan (false => părintele plătește DOAR datorii one-off).
  includeInrolari?: boolean
  // rezervare: cod de voucher opțional, aplicat pe prețul ședinței (validat server-side).
  voucherCod?: string
}

// Aplică reducerea pe sumă pornind de la tip+valoare (validitatea e verificată în DB).
// Oglindă a applyVoucher() din src/features/vouchere/calc.ts. 'Special' => fără reducere.
function applyVoucherAmount(base: number, tip: string | null, valoare: number | null): number {
  if (tip == null || valoare == null) return base
  if (tip === 'Procent') return Math.max(0, Math.round((base * (100 - valoare)) ) / 100)
  if (tip === 'Valoare') return Math.max(0, base - valoare)
  return base
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verifică identitatea: tokenul portalului e semnat HS256 cu PORTAL_JWT_SECRET
    // (director de login separat — vezi portal-auth). Validăm semnătura + rolul `parinte`.
    let portalAccountId: string
    try {
      const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(Deno.env.get('PORTAL_JWT_SECRET')!), {
        issuer: 'qapp-portal',
        audience: 'authenticated',
      })
      const role = (payload.app_metadata as { role?: string } | undefined)?.role
      if (role !== 'parinte' || !payload.sub) return json({ error: 'forbidden' }, 403)
      portalAccountId = String(payload.sub)
    } catch {
      return json({ error: 'invalid token' }, 401)
    }

    const { clientId, kind = 'abonament', sesiuneId, evenimentId, qty, panaLa, datorii, includeInrolari, voucherCod } = (await req.json()) as Body
    if (!clientId) return json({ error: 'clientId obligatoriu' }, 400)

    // Client scopat pe JWT-ul părintelui => RPC-urile validează apartenența la familie
    // prin client_member_ids() (auth.uid()).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    let amount = 0
    let plan: unknown[] = []
    let rezervareId: string | null = null
    let voucherId: string | null = null
    let nrBilete: number | null = null

    // Generat înainte de branch: `hold_bilete` stampilează order_ref pe biletele rezervate.
    const orderRef = `QM-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase()

    if (kind === 'bilet') {
      // Bilete spectacol: creează holduri (bilete 'rezervat', fără bani) → preț × qty.
      if (!evenimentId || !qty) return json({ error: 'evenimentId + qty obligatorii pentru bilet' }, 400)
      const { data: holdRes, error: holdErr } = await userClient.rpc('hold_bilete', {
        p_eveniment: evenimentId,
        p_qty: qty,
        p_client: clientId,
        p_order_ref: orderRef,
      })
      if (holdErr) return json({ error: holdErr.message }, 400)
      amount = Number(holdRes?.amount ?? 0)
      nrBilete = Number(holdRes?.nr ?? 0)
      if (amount <= 0 || !nrBilete) return json({ error: 'Bilete invalide.' }, 400)
    } else if (kind === 'rezervare') {
      // Rezervare OPEN class: creează un hold (loc 'rezervat', fără bani) → prețul ședinței.
      if (!sesiuneId) return json({ error: 'sesiuneId obligatoriu pentru rezervare' }, 400)
      const { data: holdRes, error: holdErr } = await userClient.rpc('hold_loc_open', {
        p_client: clientId,
        p_sesiune: sesiuneId,
      })
      if (holdErr) return json({ error: holdErr.message }, 400)
      amount = Number(holdRes?.amount ?? 0)
      rezervareId = (holdRes?.rezervare_id as string) ?? null
      if (amount <= 0 || !rezervareId) return json({ error: 'Rezervare invalidă.' }, 400)

      // Voucher opțional pe rezervare: validăm server-side, apoi aplicăm reducerea.
      const cod = (voucherCod ?? '').trim()
      if (cod) {
        const releaseHold = () =>
          admin.from('open_rezervari').update({
            status: 'anulat', anulat_at: new Date().toISOString(), anulat_motiv: 'voucher invalid',
          }).eq('id', rezervareId)

        const { data: ses } = await admin.from('open_sesiuni').select('curs').eq('id', sesiuneId).single()
        const { data: vres, error: vErr } = await userClient.rpc('validate_voucher_code', {
          p_cod: cod, p_client: clientId, p_curs: ses?.curs ?? undefined, p_tip: 'Per sedinta',
        })
        const verdict = Array.isArray(vres) ? vres[0] : vres
        if (vErr || !verdict?.valid) {
          await releaseHold()
          return json({ error: verdict?.reason ?? vErr?.message ?? 'Voucher invalid.' }, 400)
        }
        const redus = applyVoucherAmount(amount, verdict.tip, Number(verdict.valoare))
        if (redus <= 0) {
          await releaseHold()
          return json({ error: 'Voucherul acoperă integral ședința — rezervarea gratuită se face la recepție.' }, 400)
        }
        amount = redus
        voucherId = verdict.voucher_id as string
      }
    } else {
      // Abonament: recalculează restanța FIFO server-side (sursa de adevăr a sumei).
      // Include opțional datoriile one-off (Bilet/Merch/Taxă) selectate (plată integrală).
      const { data: planRes, error: planErr } = await userClient.rpc('build_fifo_plan_membru', {
        p_client: clientId,
        p_pana_la: panaLa ?? undefined,
        p_datorii: datorii ?? undefined,
        p_include_inrolari: includeInrolari ?? undefined,
      })
      if (planErr) return json({ error: planErr.message }, 403)
      amount = Number(planRes?.amount ?? 0)
      plan = planRes?.plan ?? []
      if (amount <= 0) return json({ error: 'Nimic de plătit pentru acest membru.' }, 400)
    }

    // Date de facturare: clientul, cu fallback pe reprezentantul familiei.
    const { data: client } = await admin
      .from('clienti')
      .select('nume, prenume, email, telefon, familia')
      .eq('id', clientId)
      .single()
    let billingEmail = client?.email ?? null
    let billingPhone = client?.telefon ?? null
    if (client?.familia) {
      const { data: fam } = await admin
        .from('familii')
        .select('email, telefon, nume_reprezentant, prenume_reprezentant')
        .eq('id', client.familia)
        .single()
      billingEmail = billingEmail ?? fam?.email ?? null
      billingPhone = billingPhone ?? fam?.telefon ?? null
    }

    // Înregistrează intentul ÎNAINTE de a contacta Netopia (sursa de adevăr a sumei).
    const { error: insErr } = await admin.from('netopia_orders').insert({
      order_ref: orderRef,
      client_id: clientId,
      auth_user_id: portalAccountId,
      amount,
      fifo_plan: plan,
      status: 'pending',
      order_type: kind,
      rezervare_id: rezervareId,
      voucher_id: voucherId,
      eveniment_id: kind === 'bilet' ? evenimentId : null,
      nr_bilete: nrBilete,
    })
    if (insErr) {
      // eliberează holdurile orfane (rezervare / bilete stampilate cu acest order_ref)
      if (rezervareId) await admin.rpc('cancel_netopia_order', { p_order_ref: orderRef })
      if (kind === 'bilet') await admin.from('bilete').update({ status: 'anulat' }).eq('order_ref', orderRef)
      return json({ error: `order insert: ${insErr.message}` }, 500)
    }

    const portalBase = (Deno.env.get('PORTAL_BASE_URL') ?? '').replace(/\/$/, '')
    const returnPath = kind === 'rezervare' ? 'rezervari' : kind === 'bilet' ? 'bilete' : 'plati'
    const description = kind === 'rezervare'
      ? `Rezervare ședință Quasar Dance (${orderRef})`
      : kind === 'bilet'
        ? `Bilete spectacol Quasar Dance (${orderRef})`
        : `Plată abonament Quasar Dance (${orderRef})`
    const startReq = {
      config: {
        language: 'ro',
        notifyUrl: `${url}/functions/v1/netopia-webhook`,
        redirectUrl: `${portalBase}/${returnPath}?order=${orderRef}`,
      },
      payment: { options: { installments: 0, bonus: 0 } },
      order: {
        posSignature: Deno.env.get('NETOPIA_POS_SIGNATURE')!,
        dateTime: new Date().toISOString(),
        description,
        orderID: orderRef,
        amount,
        currency: 'RON',
        billing: {
          email: billingEmail ?? 'plati@quasardance.ro',
          phone: billingPhone ?? '0700000000',
          firstName: client?.prenume ?? client?.nume ?? 'Membru',
          lastName: client?.nume ?? 'Quasar',
          city: 'Iași',
          country: 642, // cod ISO numeric România
          countryName: 'Romania',
          state: 'Iași',
          postalCode: '700000',
          details: '',
        },
      },
    }

    const ntpRes = await fetch(`${NETOPIA_BASE}/payment/card/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: Deno.env.get('NETOPIA_API_KEY')! },
      body: JSON.stringify(startReq),
    })
    const rawText = await ntpRes.text()
    let ntp: any = null
    try { ntp = JSON.parse(rawText) } catch { /* Netopia a răspuns non-JSON (ex. HTML) */ }
    const redirectUrl = ntp?.payment?.paymentURL
    if (!ntpRes.ok || !redirectUrl) {
      // eliberează holdul (dacă e rezervare) + marchează comanda canceled
      await admin.rpc('cancel_netopia_order', { p_order_ref: orderRef })
      console.error('Netopia start failed', ntpRes.status, `${NETOPIA_BASE}/payment/card/start`, rawText.slice(0, 500))
      return json({ error: ntp?.error?.message ?? 'Netopia start a eșuat', netopia: ntp?.error }, 502)
    }

    return json({ redirectUrl, orderId: orderRef })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
