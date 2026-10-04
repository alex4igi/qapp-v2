// Edge Function: restituirea unei plăți online (JWT staff, owner/admin).
//
//   restituie  {order_ref, suma, motiv, mod}  mod = 'netopia' (cere returul prin API)
//                                              | 'manual' (returul s-a făcut în panoul Netopia)
//   finalizeaza {id}  o restituire rămasă `in_curs` (răspuns pierdut): omul a verificat
//                     în panoul Netopia că banii au plecat → se înregistrează
//   renunta     {id}  aceeași, dar returul NU s-a făcut → se închide fără bani
//
// Ordinea contează: rândul `in_curs` se scrie ÎNAINTE de apelul la Netopia, ca un
// răspuns pierdut să nu lase bani plecați fără urmă și să nu permită a doua cerere.
// Stornarea FGO e izolată: o eroare acolo nu desface restituirea, rămâne pe rând.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { requireStaffRole } from '../_shared/staffAuth.ts'
import { FAILED_STATUSES, netopiaBase } from '../_shared/netopia.ts'
import { stornoInvoice } from '../_shared/fgo.ts'

// Oglindește butonul din /plati (isAdminOrHigher).
const ROLES = ['owner', 'admin']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Body = {
  actiune?: 'restituie' | 'finalizeaza' | 'renunta'
  order_ref?: string
  suma?: number
  motiv?: string
  mod?: 'netopia' | 'manual'
  id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const auth = await requireStaffRole(req, ROLES, admin)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const body = (await req.json()) as Body

    if (body.actiune === 'renunta' || body.actiune === 'finalizeaza') {
      if (!body.id) return json({ error: 'id lipsă' }, 400)
      const { data: r } = await admin
        .from('restituiri_online')
        .select('id, order_ref, status')
        .eq('id', body.id)
        .maybeSingle()
      if (!r) return json({ error: 'Restituirea nu există.' }, 404)
      if (r.status !== 'in_curs') return json({ error: 'Restituirea e deja închisă.' }, 409)

      if (body.actiune === 'renunta') {
        await admin
          .from('restituiri_online')
          .update({ status: 'esuata', eroare: `Închisă de ${auth.role}: returul nu s-a făcut în Netopia.` })
          .eq('id', r.id)
        return json({ ok: true, status: 'esuata' })
      }
      return json(await finalizeaza(admin, r.id, r.order_ref, null))
    }

    if (body.actiune !== 'restituie') return json({ error: 'acțiune necunoscută' }, 400)
    if (!body.order_ref || !body.mod) return json({ error: 'order_ref și mod sunt obligatorii' }, 400)

    const { data: start, error: startErr } = await admin.rpc('restituire_online_incepe', {
      p_order_ref: body.order_ref,
      p_suma: body.suma,
      p_motiv: body.motiv ?? '',
      p_mod: body.mod,
      p_actor: auth.userId,
      p_actor_role: auth.role,
    })
    if (startErr) return json({ error: startErr.message }, 400)
    const { id, ntp_id } = start as { id: string; ntp_id: string | null }

    if (body.mod === 'manual') return json(await finalizeaza(admin, id, body.order_ref, null))

    const credit = await cereReturNetopia(ntp_id!, Number(body.suma))
    if (credit.kind === 'refuzat') {
      await admin
        .from('restituiri_online')
        .update({ status: 'esuata', eroare: credit.mesaj, netopia_raspuns: credit.raspuns })
        .eq('id', id)
      return json({
        error: `Netopia a refuzat returul: ${credit.mesaj}. Nu s-a înregistrat nimic. Poți face returul din panoul Netopia și să-l înregistrezi ca făcut manual.`,
      }, 502)
    }
    if (credit.kind === 'necunoscut') {
      // Nu știm dacă banii au plecat: rândul rămâne `in_curs` și blochează altă cerere.
      await admin
        .from('restituiri_online')
        .update({ eroare: credit.mesaj, netopia_raspuns: credit.raspuns })
        .eq('id', id)
      return json({
        error: `N-am primit un răspuns clar de la Netopia (${credit.mesaj}). Verifică tranzacția în panoul Netopia, apoi redeschide restituirea și alege ce s-a întâmplat.`,
      }, 502)
    }

    await admin.from('restituiri_online').update({ netopia_raspuns: credit.raspuns }).eq('id', id)
    return json(await finalizeaza(admin, id, body.order_ref, credit.raspuns))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

type Credit =
  | { kind: 'ok'; raspuns: unknown }
  | { kind: 'refuzat' | 'necunoscut'; mesaj: string; raspuns: unknown }

async function cereReturNetopia(ntpID: string, amount: number): Promise<Credit> {
  let res: Response
  try {
    res = await fetch(`${netopiaBase()}/operation/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: Deno.env.get('NETOPIA_API_KEY')! },
      body: JSON.stringify({ ntpID, amount: Math.round(amount * 100) / 100 }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    return { kind: 'necunoscut', mesaj: e instanceof Error ? e.message : String(e), raspuns: null }
  }

  const text = await res.text()
  let data: { payment?: { status?: number }; error?: { code?: string | number; message?: string } } | null = null
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  const raspuns = data ?? { http: res.status, text: text.slice(0, 500) }

  if (res.status >= 500) return { kind: 'necunoscut', mesaj: `HTTP ${res.status}`, raspuns }

  const code = data?.error?.code
  const codOk = code === undefined || code === null || String(code) === '00' || String(code) === '0'
  const status = data?.payment?.status
  if (!res.ok || !data || !codOk || (status !== undefined && FAILED_STATUSES.has(status))) {
    const mesaj = data?.error?.message || `HTTP ${res.status}: ${text.slice(0, 200)}`
    return { kind: 'refuzat', mesaj, raspuns }
  }
  return { kind: 'ok', raspuns }
}

async function finalizeaza(
  admin: SupabaseClient,
  id: string,
  orderRef: string,
  raspuns: unknown,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('restituire_online_finalizeaza', {
    p_id: id,
    p_netopia: raspuns ?? null,
  })
  if (error) {
    await admin.from('restituiri_online').update({ eroare: error.message }).eq('id', id)
    return {
      error: `Banii au plecat, dar înregistrarea în aplicație a eșuat: ${error.message}. Restituirea a rămas deschisă; după corecție, redeschide-o și apasă „Înregistrează”.`,
    }
  }
  const { storno_integral } = data as { storno_integral: boolean }
  const fgo = await storneaza(admin, id, orderRef, storno_integral)
  return { ok: true, status: 'efectuata', ...fgo }
}

async function storneaza(
  admin: SupabaseClient,
  id: string,
  orderRef: string,
  integral: boolean,
): Promise<{ fgo_status: string; fgo_storno?: string; fgo_eroare?: string }> {
  const { data: f } = await admin
    .from('facturi_fgo')
    .select('firma_cui, factura_fgo')
    .eq('ref', orderRef)
    .maybeSingle()

  // „QDS 1697" → serie QDS, număr 1697. Facturile marcate „manual (FGO)" n-au număr de stornat.
  const m = f?.factura_fgo?.trim().match(/^(\S+)\s+(\d+)$/)
  let rez: { fgo_status: string; fgo_storno?: string; fgo_eroare?: string }
  if (!f || !m) {
    rez = { fgo_status: f?.factura_fgo ? 'de_stornat_manual' : 'fara_factura' }
  } else if (!integral) {
    rez = { fgo_status: 'de_stornat_manual' }
  } else {
    try {
      const s = await stornoInvoice(f.firma_cui, m[1], m[2])
      rez = { fgo_status: 'stornata', fgo_storno: s.numar }
    } catch (e) {
      rez = { fgo_status: 'eroare', fgo_eroare: e instanceof Error ? e.message : String(e) }
    }
  }
  await admin
    .from('restituiri_online')
    .update({
      fgo_status: rez.fgo_status,
      fgo_storno: rez.fgo_storno ?? null,
      fgo_eroare: rez.fgo_eroare ?? null,
    })
    .eq('id', id)
  return rez
}
