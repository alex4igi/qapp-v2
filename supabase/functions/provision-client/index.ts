// Edge Function: provisioning conturi de PORTAL (rol `parinte`) pentru clienți/familii.
// Apelată de staff (recepție+) din qapp v2. Creează un user Supabase Auth cu
// app_metadata.role='parinte' și îl leagă de o familie SAU de un client individual
// (clienti.auth_user_id / familii.auth_user_id).
//
// Acțiuni: create, reset_password, unlink.
// Securitate: rolul 'parinte' NU are acces direct la tabele (politica RESTRICTIVE
// deny_parinte_direct); portalul citește/scrie exclusiv prin RPC SECURITY DEFINER.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']

type CreatePayload = {
  action: 'create'
  email: string
  password: string
  familieId?: string | null
  clientId?: string | null
}
type ResetPayload = { action: 'reset_password'; userId: string; password: string }
type UnlinkPayload = { action: 'unlink'; familieId?: string | null; clientId?: string | null }
type Payload = CreatePayload | ResetPayload | UnlinkPayload

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    const callerRole = (userRes.user.app_metadata?.role as string) ?? 'front_desk'
    if (!STAFF_ROLES.includes(callerRole)) return json({ error: 'forbidden' }, 403)

    const body = (await req.json()) as Payload

    if (body.action === 'create') {
      if (!body.email || !body.password) return json({ error: 'email și password obligatorii' }, 400)
      if (body.password.length < 8) return json({ error: 'parola ≥ 8 caractere' }, 400)
      const hasFamilie = !!body.familieId
      const hasClient = !!body.clientId
      if (hasFamilie === hasClient) {
        return json({ error: 'specifică EXACT una: familieId SAU clientId' }, 400)
      }

      // Refuză dacă ținta are deja un cont legat (un cont per familie/client).
      const table = hasFamilie ? 'familii' : 'clienti'
      const targetId = (body.familieId ?? body.clientId)!
      const { data: existing, error: exErr } = await admin
        .from(table)
        .select('id, auth_user_id')
        .eq('id', targetId)
        .maybeSingle()
      if (exErr) return json({ error: exErr.message }, 400)
      if (!existing) return json({ error: `${table} inexistent` }, 404)
      if (existing.auth_user_id) return json({ error: 'are deja un cont de portal' }, 409)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        app_metadata: { role: 'parinte' },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const { error: linkErr } = await admin
        .from(table)
        .update({ auth_user_id: created.user.id })
        .eq('id', targetId)
      if (linkErr) {
        // rollback contul orfan
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: `legare eșuată: ${linkErr.message}` }, 500)
      }

      return json({ user: { id: created.user.id, email: created.user.email } })
    }

    if (body.action === 'reset_password') {
      if (!body.userId || !body.password) return json({ error: 'userId și password obligatorii' }, 400)
      if (body.password.length < 8) return json({ error: 'parola ≥ 8 caractere' }, 400)
      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      if ((target.data.user?.app_metadata?.role as string) !== 'parinte') {
        return json({ error: 'cont care nu e de portal' }, 403)
      }
      const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'unlink') {
      const table = body.familieId ? 'familii' : 'clienti'
      const targetId = body.familieId ?? body.clientId
      if (!targetId) return json({ error: 'familieId sau clientId obligatoriu' }, 400)
      const { data: row } = await admin.from(table).select('auth_user_id').eq('id', targetId).maybeSingle()
      const uid = row?.auth_user_id
      await admin.from(table).update({ auth_user_id: null }).eq('id', targetId)
      if (uid) await admin.auth.admin.deleteUser(uid)
      return json({ ok: true })
    }

    return json({ error: 'acțiune necunoscută' }, 400)
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
