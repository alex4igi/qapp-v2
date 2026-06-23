// Edge Function: provisioning conturi de PORTAL (`parinte`) pentru clienți/familii.
// Apelată de staff (recepție+) din qapp v2. Creează un cont în `portal_accounts`
// (director de login SEPARAT de auth.users — vezi portal-auth) și îl leagă de o familie
// SAU de un client individual (clienti.auth_user_id / familii.auth_user_id stochează
// portal_accounts.id). Astfel același email poate fi și cont staff, și cont de portal.
//
// Acțiuni: create, reset_password, unlink.
// Securitate: parolele se hash-uiesc DOAR în DB (RPC pgcrypto SECURITY DEFINER); rolul
// 'parinte' NU are acces direct la tabele (politica RESTRICTIVE deny_parinte_direct).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']

const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://membri.quasardance.ro'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('PORTAL_FROM_EMAIL') ?? 'Quasar Dance <no-reply@quasardance.ro>'

type CreatePayload = {
  action: 'create'
  email: string
  password: string
  familieId?: string | null
  clientId?: string | null
  notify?: 'email'
}
type ResetPayload = { action: 'reset_password'; userId: string; password: string; notify?: 'email' }
type UnlinkPayload = { action: 'unlink'; familieId?: string | null; clientId?: string | null }
type Payload = CreatePayload | ResetPayload | UnlinkPayload

// Trimite datele de acces pe email (Resend). Întoarce true dacă a plecat emailul.
// Nu aruncă — provisioning-ul nu trebuie să eșueze dacă emailul nu pleacă.
async function sendCredentialsEmail(email: string, password: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const html = `
    <p>Bun venit în portalul Quasar Dance!</p>
    <p>Datele tale de acces la <a href="${PORTAL_URL}">${PORTAL_URL}</a>:</p>
    <ul>
      <li>Email: <b>${email}</b></li>
      <li>Parolă: <b>${password}</b></li>
    </ul>
    <p>Te recomandăm să schimbi parola după prima autentificare (Profil → Schimbă parola).</p>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: email, subject: 'Contul tău de portal Quasar Dance', html }),
    })
    return res.ok
  } catch {
    return false
  }
}

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

      const email = body.email.trim().toLowerCase()

      // Insert-only: întoarce null dacă emailul are deja un cont de portal.
      const { data: newId, error: createErr } = await admin.rpc('portal_create_account', {
        p_email: email,
        p_password: body.password,
      })
      if (createErr) return json({ error: createErr.message }, 500)
      if (!newId) {
        return json(
          {
            error: `Există deja un cont de portal pe emailul „${email}". Folosește alt email pentru această familie, sau resetează parola din profilul care deține deja contul.`,
          },
          409,
        )
      }

      const { error: linkErr } = await admin
        .from(table)
        .update({ auth_user_id: newId })
        .eq('id', targetId)
      if (linkErr) {
        // rollback contul orfan
        await admin.from('portal_accounts').delete().eq('id', newId)
        return json({ error: `legare eșuată: ${linkErr.message}` }, 500)
      }

      const emailed = body.notify === 'email' ? await sendCredentialsEmail(email, body.password) : undefined
      return json({ user: { id: newId, email }, emailed })
    }

    if (body.action === 'reset_password') {
      if (!body.userId || !body.password) return json({ error: 'userId și password obligatorii' }, 400)
      if (body.password.length < 8) return json({ error: 'parola ≥ 8 caractere' }, 400)
      const { data: acc } = await admin
        .from('portal_accounts')
        .select('id, email')
        .eq('id', body.userId)
        .maybeSingle()
      if (!acc) return json({ error: 'cont de portal inexistent' }, 404)
      const { error } = await admin.rpc('portal_set_password', { p_id: body.userId, p_password: body.password })
      if (error) return json({ error: error.message }, 500)
      const emailed = body.notify === 'email' ? await sendCredentialsEmail(acc.email, body.password) : undefined
      return json({ ok: true, emailed })
    }

    if (body.action === 'unlink') {
      const table = body.familieId ? 'familii' : 'clienti'
      const targetId = body.familieId ?? body.clientId
      if (!targetId) return json({ error: 'familieId sau clientId obligatoriu' }, 400)
      const { data: row } = await admin.from(table).select('auth_user_id').eq('id', targetId).maybeSingle()
      const uid = row?.auth_user_id
      await admin.from(table).update({ auth_user_id: null }).eq('id', targetId)
      // șterge contul de portal (cascade → sesiuni/reset tokens)
      if (uid) await admin.from('portal_accounts').delete().eq('id', uid)
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
