// Edge Function: inițiază o plată online Netopia (Payments API v2) pentru un membru
// al portalului (rol `parinte`). Recalculează restanța FIFO server-side (sursa de adevăr
// a sumei — clientul NU o trimite), creează un rând `netopia_orders` (pending) și întoarce
// URL-ul de redirecționare spre pagina de plată Netopia.
//
// Confirmarea efectivă (scrierea în `incasari`) se face DOAR din `netopia-webhook`.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Netopia v2 — endpoint card/start (sandbox vs live după NETOPIA_ENV).
const NETOPIA_BASE = (Deno.env.get('NETOPIA_ENV') ?? 'sandbox') === 'live'
  ? 'https://secure.mobilpay.ro/pay'
  : 'https://secure.sandbox.netopia-payments.com'

type Body = {
  clientId: string
  kind?: 'abonament' | 'rezervare'
  sesiuneId?: string
  // abonament: plătește restanța până la (și inclusiv) această înrolare/lună (FIFO);
  // null => toată restanța. Garda cronologică e validată server-side în RPC.
  panaLa?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verifică identitatea + rolul `parinte`.
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    if ((userRes.user.app_metadata?.role as string) !== 'parinte') {
      return json({ error: 'forbidden' }, 403)
    }

    const { clientId, kind = 'abonament', sesiuneId, panaLa } = (await req.json()) as Body
    if (!clientId) return json({ error: 'clientId obligatoriu' }, 400)

    // Client scopat pe JWT-ul părintelui => RPC-urile validează apartenența la familie
    // prin client_member_ids() (auth.uid()).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    let amount = 0
    let plan: unknown[] = []
    let rezervareId: string | null = null

    if (kind === 'rezervare') {
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
    } else {
      // Abonament: recalculează restanța FIFO server-side (sursa de adevăr a sumei).
      const { data: planRes, error: planErr } = await userClient.rpc('build_fifo_plan_membru', {
        p_client: clientId,
        p_pana_la: panaLa ?? undefined,
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

    const orderRef = `QM-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase()

    // Înregistrează intentul ÎNAINTE de a contacta Netopia (sursa de adevăr a sumei).
    const { error: insErr } = await admin.from('netopia_orders').insert({
      order_ref: orderRef,
      client_id: clientId,
      auth_user_id: userRes.user.id,
      amount,
      fifo_plan: plan,
      status: 'pending',
      order_type: kind,
      rezervare_id: rezervareId,
    })
    if (insErr) {
      // dacă a rămas un hold orfan, eliberează-l
      if (rezervareId) await admin.rpc('cancel_netopia_order', { p_order_ref: orderRef })
      return json({ error: `order insert: ${insErr.message}` }, 500)
    }

    const portalBase = (Deno.env.get('PORTAL_BASE_URL') ?? '').replace(/\/$/, '')
    const returnPath = kind === 'rezervare' ? 'rezervari' : 'plati'
    const description = kind === 'rezervare'
      ? `Rezervare ședință Quasar Dance (${orderRef})`
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
    const ntp = await ntpRes.json().catch(() => null)
    const redirectUrl = ntp?.payment?.paymentURL
    if (!ntpRes.ok || !redirectUrl) {
      // eliberează holdul (dacă e rezervare) + marchează comanda canceled
      await admin.rpc('cancel_netopia_order', { p_order_ref: orderRef })
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
