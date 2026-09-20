// Edge Function: „Retrimite link" din lista de contracte (JWT staff).
//
// Trimite din nou ACELAȘI link de semnare și repornește valabilitatea de azi, cu
// remindere noi la 3/7 zile. Merge pe contracte trimise, deschise sau expirate —
// un contract expirat redevine semnabil pe linkul lui, dar doar dacă familia n-a
// primit între timp alt contract pe același șablon (gardul de dublură din contract-send).
import { mesajContract, notificaContract } from '../_shared/contractNotify.ts'
import { linkSemnare, logEvent, serviceClient } from '../_shared/contracte.ts'
import { requireStaffRole } from '../_shared/staffAuth.ts'

// Aceleași roluri ca contract-send.
const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']
const RETRIMITIBILE = ['trimis', 'deschis', 'expirat']

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = serviceClient()
    const auth = await requireStaffRole(req, STAFF_ROLES, admin)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const { contractId } = (await req.json()) as { contractId?: string }
    if (!contractId) return json({ error: 'contractId este obligatoriu' }, 400)

    const { data: c } = await admin
      .from('contracte')
      .select('id, status, template_id, familie_id, client_id, deschis_prima_data_la, contract_templates(valabilitate_zile)')
      .eq('id', contractId)
      .maybeSingle()
    if (!c) return json({ error: 'Contract inexistent' }, 404)
    if (!RETRIMITIBILE.includes(c.status)) {
      return json({ error: `Contractul e „${c.status}" — nu se mai poate retrimite.` }, 409)
    }

    const { data: familie } = await admin
      .from('familii')
      .select('telefon, email')
      .eq('id', c.familie_id)
      .single()
    if (!familie?.telefon && !familie?.email) {
      return json({ error: 'Familia nu are telefon sau email în fișă.' }, 400)
    }

    if (c.status === 'expirat') {
      let dupQuery = admin
        .from('contracte')
        .select('id, status')
        .eq('template_id', c.template_id)
        .eq('familie_id', c.familie_id)
        .neq('id', c.id)
        .in('status', ['trimis', 'deschis', 'semnat', 'finalizat'])
      if (c.client_id) dupQuery = dupQuery.eq('client_id', c.client_id)
      const { data: dup } = await dupQuery.limit(1)
      if (dup && dup.length > 0) {
        return json({ error: `Familia are deja alt contract ${dup[0].status} pe acest șablon.` }, 409)
      }
    }

    let prenumeCopil: string | null = null
    if (c.client_id) {
      const { data: copil } = await admin
        .from('clienti')
        .select('prenume, nume')
        .eq('id', c.client_id)
        .single()
      prenumeCopil = copil?.prenume ?? copil?.nume ?? null
    }

    const tpl = c.contract_templates as unknown as { valabilitate_zile: number } | null
    const zile = tpl?.valabilitate_zile ?? 30
    const acum = new Date()
    const expiraLa = new Date(acum.getTime() + zile * 86400_000).toISOString()
    const link = await linkSemnare(admin, c.id)

    // Guard pe status: dacă părintele a semnat între timp, nu retrimitem nimic.
    const { data: upd } = await admin
      .from('contracte')
      .update({
        status: c.status === 'expirat' ? (c.deschis_prima_data_la ? 'deschis' : 'trimis') : c.status,
        token_expira_la: expiraLa,
        trimis_la: acum.toISOString(),
        reminder_count: 0,
        last_reminder_la: null,
      })
      .eq('id', c.id)
      .eq('status', c.status)
      .select('id')
    if (!upd || upd.length === 0) {
      return json({ error: 'Contractul s-a schimbat între timp (poate a fost semnat). Reîncarcă lista.' }, 409)
    }

    await logEvent(admin, c.id, 'retrimis', {
      de: auth.email,
      status_anterior: c.status,
      expira_la: expiraLa,
    })

    const notif = await notificaContract(admin, {
      contractId: c.id,
      telefon: familie.telefon,
      email: familie.email,
      clientId: c.client_id,
      codMesaj: 'contract',
      ...mesajContract(prenumeCopil, link, zile),
    })

    return json({
      ok: true,
      canal: notif.canal,
      notificat: notif.ok,
      amanat: notif.amanat ?? false,
      notificareEroare: notif.error,
      expiraLa,
    })
  } catch (e) {
    console.error('contract-resend error:', e)
    return json({ error: String(e) }, 500)
  }
})
