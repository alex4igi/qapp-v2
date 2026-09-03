// Edge Function: creează contracte din template și trimite linkurile de semnare.
// Apelată din staff app (JWT staff). SMS pleacă prin coada
// situatie_sms_uri (drenată de process-sms-queue, cu quiet hours); email doar
// dacă familia are adresă (stub până la validarea SPF/DKIM pe domeniu).
import { sendEmail } from '../_shared/messaging.ts'
import { logEvent, portalUrl, randomToken, serviceClient, sha256Hex } from '../_shared/contracte.ts'

// Aceleași roluri ca ROUTE_ACCESS['/contracte'] (ALL_STAFF, recepția inclusă) și
// ca contract-template-storage: recepția trimite contractele la ghișeu.
const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']

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

// SMS fără diacritice, ≤160 caractere (regulă casă).
function buildSmsText(prenumeCopil: string | null, link: string, zile: number): string {
  const cine = prenumeCopil ? ` pentru ${prenumeCopil}` : ''
  return `Quasar Dance: contractul${cine} este pregatit de semnare. Deschide linkul, verifica datele si semneaza: ${link} (valabil ${zile} zile)`
}

type Target = {
  familieId: string
  clientId?: string | null
  gateId?: string | null
  // pentru actul adițional de reînscriere: leagă contractul de poarta campaniei
  campanieId?: string | null
  cursTintaId?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // autorizare: staff
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const admin = serviceClient()
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    const role = (userRes.user.app_metadata as { role?: string })?.role ?? 'front_desk'
    if (!STAFF_ROLES.includes(role)) return json({ error: 'rol fără drept de trimitere contracte' }, 403)

    const { templateId, targets } = (await req.json()) as {
      templateId: string
      targets: Target[]
    }
    if (!templateId || !Array.isArray(targets) || targets.length === 0) {
      return json({ error: 'templateId și targets sunt obligatorii' }, 400)
    }

    const { data: tpl, error: tplErr } = await admin
      .from('contract_templates')
      .select('id, tip, nume, activ, valabilitate_zile, locked_at')
      .eq('id', templateId)
      .single()
    if (tplErr || !tpl) return json({ error: 'Template inexistent' }, 404)
    if (!tpl.activ) return json({ error: 'Template inactiv' }, 400)

    // prima trimitere blochează template-ul (imutabilitate probatorie)
    if (!tpl.locked_at) {
      await admin
        .from('contract_templates')
        .update({ locked_at: new Date().toISOString() })
        .eq('id', templateId)
    }

    const results: Array<Record<string, unknown>> = []

    for (const t of targets) {
      const { data: familie } = await admin
        .from('familii')
        .select('id, nume_familie, nume_reprezentant, prenume_reprezentant, telefon, email')
        .eq('id', t.familieId)
        .single()
      if (!familie) {
        results.push({ familieId: t.familieId, ok: false, error: 'familie inexistentă' })
        continue
      }
      if (!familie.telefon && !familie.email) {
        results.push({ familieId: t.familieId, ok: false, error: 'familie fără telefon și email' })
        continue
      }

      let prenumeCopil: string | null = null
      if (t.clientId) {
        const { data: copil } = await admin
          .from('clienti')
          .select('prenume, nume')
          .eq('id', t.clientId)
          .single()
        prenumeCopil = copil?.prenume ?? copil?.nume ?? null
      }

      // gard dublură: nu retrimitem dacă există deja un contract activ pe același
      // template + familie (+ copil, dacă e per-copil, ex. act adițional per gate)
      let dupQuery = admin
        .from('contracte')
        .select('id, status')
        .eq('template_id', templateId)
        .eq('familie_id', t.familieId)
        .in('status', ['trimis', 'deschis', 'semnat', 'finalizat'])
      if (t.clientId) dupQuery = dupQuery.eq('client_id', t.clientId)
      const { data: dup } = await dupQuery.limit(1)
      if (dup && dup.length > 0) {
        results.push({
          familieId: t.familieId, ok: false,
          error: `există deja un contract ${dup[0].status} pe acest template`,
          contractId: dup[0].id,
        })
        continue
      }

      // poarta de reînscriere: upsert gate + marchează 'trimis' (canal app);
      // nu retrogradăm un act deja de_verificat/verificat/semnat
      let gateId = t.gateId ?? null
      if (t.campanieId && t.cursTintaId && t.clientId) {
        const { data: g } = await admin
          .from('reinscrieri_gate')
          .select('id, act_status, activat_la')
          .eq('campanie_id', t.campanieId)
          .eq('client_id', t.clientId)
          .eq('curs_tinta_id', t.cursTintaId)
          .maybeSingle()
        if (g) {
          gateId = g.id
          const canMark = !g.activat_la &&
            ['nesemnat', 'trimis', 'expirat', 'anulat'].includes(g.act_status ?? 'nesemnat')
          if (canMark) {
            await admin
              .from('reinscrieri_gate')
              .update({ act_status: 'trimis', act_canal: 'app', updated: new Date().toISOString() })
              .eq('id', g.id)
          }
        } else {
          const { data: ng } = await admin
            .from('reinscrieri_gate')
            .insert({
              campanie_id: t.campanieId,
              client_id: t.clientId,
              curs_tinta_id: t.cursTintaId,
              act_status: 'trimis',
              act_canal: 'app',
            })
            .select('id')
            .single()
          gateId = ng?.id ?? null
        }
      }

      const token = randomToken()
      const tokenHash = await sha256Hex(token)
      const expiraLa = new Date(Date.now() + tpl.valabilitate_zile * 86400_000).toISOString()

      const { data: contract, error: insErr } = await admin
        .from('contracte')
        .insert({
          template_id: templateId,
          familie_id: t.familieId,
          client_id: t.clientId ?? null,
          gate_id: gateId,
          campanie_id: t.campanieId ?? null,
          status: 'trimis',
          token_hash: tokenHash,
          token_expira_la: expiraLa,
          trimis_la: new Date().toISOString(),
          created_by: userRes.user.id,
        })
        .select('id')
        .single()
      if (insErr || !contract) {
        results.push({ familieId: t.familieId, ok: false, error: insErr?.message })
        continue
      }

      await logEvent(admin, contract.id, 'creat', { template: tpl.nume, de: userRes.user.email })
      await logEvent(admin, contract.id, 'trimis', {
        telefon_mascat: familie.telefon ? `…${familie.telefon.slice(-4)}` : null,
        email: familie.email ?? null,
      })

      const link = `${portalUrl()}/s/${token}`

      if (familie.telefon) {
        const mesaj = buildSmsText(prenumeCopil, link, tpl.valabilitate_zile)
        const { error: smsErr } = await admin.from('situatie_sms_uri').insert({
          telefon: familie.telefon,
          mesaj,
          cod_mesaj: 'contract',
          status: 'De trimis',
          clienti_vizati: t.clientId ? [t.clientId] : [],
          data_planificata: new Date().toISOString().slice(0, 10),
        })
        if (!smsErr) await logEvent(admin, contract.id, 'sms_pus_in_coada', {})
        else await logEvent(admin, contract.id, 'eroare', { pas: 'sms', mesaj_eroare: smsErr.message })
      }

      if (familie.email) {
        const cine = prenumeCopil ? ` pentru ${prenumeCopil}` : ''
        const res = await sendEmail({
          to: familie.email,
          subject: `Quasar Dance — contract de semnat${cine}`,
          html:
            `<p>Bună ziua,</p><p>Contractul${cine} este pregătit pentru semnare. ` +
            `Deschideți linkul de mai jos, verificați datele și semnați:</p>` +
            `<p><a href="${link}">${link}</a></p>` +
            `<p>Linkul este valabil ${tpl.valabilitate_zile} zile.</p><p>Quasar Dance</p>`,
        })
        if (res.ok && !res.stub) await logEvent(admin, contract.id, 'email_trimis', {})
      }

      results.push({ familieId: t.familieId, ok: true, contractId: contract.id })
    }

    return json({ results })
  } catch (e) {
    console.error('contract-send error:', e)
    return json({ error: String(e) }, 500)
  }
})
