// Edge Function: portal-auth — DIRECTOR DE LOGIN SEPARAT pentru portalul de membri.
//
// Verifică credențialele în `portal_accounts` (independent de auth.users / staff) și emite
// un JWT semnat HS256 cu secretul JWT al proiectului (PORTAL_JWT_SECRET = secretul legacy,
// încă acceptat de gateway). Tokenul are `sub = portal_accounts.id` și
// app_metadata.role='parinte' → compatibil cu auth.uid()/auth_role() din RPC-urile existente,
// iar `deny_parinte_direct` blochează în continuare accesul direct la tabele.
//
// Acțiuni: login, refresh, logout, request_reset, reset, change_password.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as jose from 'npm:jose@5'
import { sendEmail } from '../_shared/messaging.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ACCESS_TTL_SEC = 3600 // 1h
const REFRESH_TTL_DAYS = 30
const RESET_TTL_MIN = 60

const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') ?? ''
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://membri.quasardance.ro'
const PORTAL_FROM_EMAIL = Deno.env.get('PORTAL_FROM_EMAIL') || undefined

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// token opac aleator (base64url) + hash sha256 (stocăm doar hash-ul)
function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function mintAccessToken(accountId: string): Promise<{ token: string; expiresAt: number }> {
  const secret = new TextEncoder().encode(JWT_SECRET)
  const nowSec = Math.floor(Date.now() / 1000)
  const exp = nowSec + ACCESS_TTL_SEC
  const token = await new jose.SignJWT({
    role: 'authenticated',
    app_metadata: { role: 'parinte', provider: 'portal' },
    user_metadata: {},
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(accountId)
    .setAudience('authenticated')
    .setIssuer('qapp-portal')
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(secret)
  return { token, expiresAt: exp * 1000 }
}

async function createSession(accountId: string) {
  const refresh = randomToken()
  const hash = await sha256(refresh)
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000).toISOString()
  await admin.from('portal_sessions').insert({ account_id: accountId, token_hash: hash, expires_at: expires })
  return refresh
}

async function issueTokens(accountId: string) {
  const { token, expiresAt } = await mintAccessToken(accountId)
  const refresh = await createSession(accountId)
  return { access_token: token, refresh_token: refresh, expires_at: expiresAt, account_id: accountId }
}

async function sendResetEmail(email: string, link: string) {
  const html = `
    <p>Salut,</p>
    <p>Ai cerut resetarea parolei pentru contul tău de portal Quasar Dance.</p>
    <p><a href="${link}">Setează o parolă nouă</a> (link valabil ${RESET_TTL_MIN} de minute).</p>
    <p>Dacă nu ai cerut tu, ignoră acest email.</p>`
  const r = await sendEmail({
    to: email,
    subject: 'Resetare parolă portal Quasar Dance',
    html,
    fromOverride: PORTAL_FROM_EMAIL,
  })
  if (!r.ok) throw new Error(`trimitere email eșuată: ${r.error ?? 'necunoscut'}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!JWT_SECRET) return json({ error: 'PORTAL_JWT_SECRET neconfigurat' }, 500)

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action as string

    // ---- login ----
    if (action === 'login') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (!email || !password) return json({ error: 'email și parolă obligatorii' }, 400)
      const { data, error } = await admin.rpc('portal_login', { p_email: email, p_password: password })
      if (error) return json({ error: error.message }, 500)
      const row = Array.isArray(data) ? data[0] : data
      if (!row?.id) return json({ error: 'Email sau parolă greșite (sau cont blocat temporar).' }, 401)
      return json({ ...(await issueTokens(row.id)), email: row.email })
    }

    // ---- refresh ----
    if (action === 'refresh') {
      const refresh = String(body.refresh_token ?? '')
      if (!refresh) return json({ error: 'refresh_token lipsă' }, 400)
      const hash = await sha256(refresh)
      const { data: sess } = await admin
        .from('portal_sessions')
        .select('id, account_id, expires_at')
        .eq('token_hash', hash)
        .maybeSingle()
      if (!sess || new Date(sess.expires_at) < new Date()) {
        if (sess) await admin.from('portal_sessions').delete().eq('id', sess.id)
        return json({ error: 'sesiune expirată' }, 401)
      }
      // rotație: șterge sesiunea veche, emite alta
      await admin.from('portal_sessions').delete().eq('id', sess.id)
      return json(await issueTokens(sess.account_id))
    }

    // ---- logout ----
    if (action === 'logout') {
      const refresh = String(body.refresh_token ?? '')
      if (refresh) await admin.from('portal_sessions').delete().eq('token_hash', await sha256(refresh))
      return json({ ok: true })
    }

    // ---- request_reset ---- (răspuns identic indiferent dacă emailul există)
    if (action === 'request_reset') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!email) return json({ error: 'email obligatoriu' }, 400)
      const { data: acc } = await admin.from('portal_accounts').select('id').eq('email', email).maybeSingle()
      if (acc?.id) {
        const token = randomToken()
        const expires = new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString()
        await admin.from('portal_reset_tokens').insert({ account_id: acc.id, token_hash: await sha256(token), expires_at: expires })
        const link = `${PORTAL_URL}/reset?token=${token}`
        try {
          await sendResetEmail(email, link)
        } catch (e) {
          return json({ error: String((e as Error).message ?? e) }, 502)
        }
      }
      return json({ ok: true })
    }

    // ---- reset ---- (token din email + parolă nouă)
    if (action === 'reset') {
      const token = String(body.token ?? '')
      const password = String(body.password ?? '')
      if (!token || password.length < 8) return json({ error: 'token și parolă (min. 8) obligatorii' }, 400)
      const hash = await sha256(token)
      const { data: rt } = await admin
        .from('portal_reset_tokens')
        .select('id, account_id, expires_at, used_at')
        .eq('token_hash', hash)
        .maybeSingle()
      if (!rt || rt.used_at || new Date(rt.expires_at) < new Date()) {
        return json({ error: 'link de resetare invalid sau expirat' }, 400)
      }
      const { error } = await admin.rpc('portal_set_password', { p_id: rt.account_id, p_password: password })
      if (error) return json({ error: error.message }, 500)
      await admin.from('portal_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', rt.id)
      return json({ ok: true })
    }

    // ---- change_password ---- (din portal, logat; cere Authorization: Bearer <access_token>)
    if (action === 'change_password') {
      const authz = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!authz) return json({ error: 'neautentificat' }, 401)
      let accountId: string
      let email: string
      try {
        const { payload } = await jose.jwtVerify(authz, new TextEncoder().encode(JWT_SECRET), {
          audience: 'authenticated',
          issuer: 'qapp-portal',
        })
        accountId = String(payload.sub)
        const { data: acc } = await admin.from('portal_accounts').select('email').eq('id', accountId).maybeSingle()
        if (!acc?.email) return json({ error: 'cont inexistent' }, 401)
        email = acc.email
      } catch {
        return json({ error: 'token invalid' }, 401)
      }
      const oldPwd = String(body.old_password ?? '')
      const newPwd = String(body.new_password ?? '')
      if (newPwd.length < 8) return json({ error: 'parola nouă min. 8 caractere' }, 400)
      // Parola veche e opțională: tokenul valid dovedește deja identitatea. Dacă e
      // furnizată, o verificăm (defense-in-depth pentru schimbarea din contul logat).
      if (oldPwd) {
        const { data: ok } = await admin.rpc('portal_login', { p_email: email, p_password: oldPwd })
        if (!(Array.isArray(ok) ? ok[0]?.id : ok?.id)) return json({ error: 'parola actuală e greșită' }, 403)
      }
      const { error } = await admin.rpc('portal_set_password', { p_id: accountId, p_password: newPwd })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'acțiune necunoscută' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
