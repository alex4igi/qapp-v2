// Edge Function: provisioning conturi de PORTAL (`parinte`) pentru clienți/familii.
// Apelată de staff (recepție+) din qapp v2. Creează un cont în `portal_accounts`
// (director de login SEPARAT de auth.users — vezi portal-auth) și îl leagă de o familie
// SAU de un client individual (clienti.auth_user_id / familii.auth_user_id stochează
// portal_accounts.id). Astfel același email poate fi și cont staff, și cont de portal.
//
// Acțiuni: create, reset_password, unlink.
// Securitate: parolele se hash-uiesc DOAR în DB (RPC pgcrypto SECURITY DEFINER); rolul
// 'parinte' NU are acces direct la tabele (politica RESTRICTIVE deny_parinte_direct).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail, sendSms } from '../_shared/messaging.ts'
import {
  deferUntil,
  getQuietHoursConfig,
  isQuiet,
  localDateBucharest,
} from '../_shared/quietHours.ts'
import { requireStaffRole } from '../_shared/staffAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STAFF_ROLES = ['owner', 'admin', 'manager', 'front_desk']

const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://membri.quasardance.ro'
const PORTAL_FROM_EMAIL = Deno.env.get('PORTAL_FROM_EMAIL') || undefined

type Notify = 'email' | 'sms'
type CreatePayload = {
  action: 'create'
  email: string
  password: string
  familieId?: string | null
  clientId?: string | null
  notify?: Notify
  // Parola trimisă acum e temporară: portalul cere una nouă la prima autentificare.
  mustChange?: boolean
}
type ResetPayload = { action: 'reset_password'; userId: string; password: string; notify?: Notify }
type UnlinkPayload = { action: 'unlink'; familieId?: string | null; clientId?: string | null }
type Payload = CreatePayload | ResetPayload | UnlinkPayload

// Trimite datele de acces pe email (TheMarketer transactional). Întoarce true dacă a plecat.
// Nu aruncă — provisioning-ul nu trebuie să eșueze dacă emailul nu pleacă.
async function sendCredentialsEmail(
  email: string,
  password: string,
  mustChange = false,
): Promise<boolean> {
  const inchidere = mustChange
    ? '<p>La prima autentificare îți vei alege o parolă nouă, doar a ta — parola de mai sus funcționează o singură dată.</p>'
    : '<p>Te recomandăm să schimbi parola după prima autentificare (Profil → Schimbă parola).</p>'
  const html = `
    <p>Bun venit în portalul Quasar Dance!</p>
    <p>Datele tale de acces la <a href="${PORTAL_URL}">${PORTAL_URL}</a>:</p>
    <ul>
      <li>Email: <b>${email}</b></li>
      <li>Parolă: <b>${password}</b></li>
    </ul>
    ${inchidere}`
  try {
    const r = await sendEmail({
      to: email,
      subject: 'Contul tău de portal Quasar Dance',
      html,
      fromOverride: PORTAL_FROM_EMAIL,
    })
    return r.ok
  } catch {
    return false
  }
}

// Trimite datele de acces pe SMS (TheMarketer/SMSLink prin wrapper). Fără diacritice
// (GSM-7). Depășește 160 de caractere la un email obișnuit ⇒ 2 segmente; asumat,
// fiindcă mesajul pleacă o singură dată per cont.
//
// RESPECTĂ ZONA INTERZISĂ (decizie 20.09.2026): era singura cale de SMS din tot
// repo-ul care suna direct `sendSms`, fără gardul `isQuiet` — recepția care crea
// un cont la 20:30 trimitea parola în mijlocul serii. În fereastră, mesajul intră
// în `sms_amanate` și pleacă dimineața, prin process-sms-amanate.
//
// Scrie și rândul din `situatie_sms_uri`, ca /notificari-sms să rămână jurnalul
// complet de SMS-uri — la fel ca fluxul de contracte (vezi _shared/contractNotify.ts).
type RezultatSms = { plecat: boolean; amanat: boolean }

async function sendCredentialsSms(
  admin: SupabaseClient,
  telefon: string,
  email: string,
  password: string,
  mustChange = false,
): Promise<RezultatSms> {
  const mesaj =
    `Quasar Dance: contul de membru este activ. Acces: ${PORTAL_URL} ` +
    `Email: ${email} Parola temporara: ${password} ` +
    (mustChange
      ? `La prima autentificare iti alegi parola ta.`
      : `Va recomandam sa schimbati parola dupa prima autentificare.`)

  const now = new Date()
  const cfg = await getQuietHoursConfig(admin)
  const amanat = isQuiet(now, cfg)
  const sendAfter = amanat ? deferUntil(now, cfg) : null

  const { data: rand } = await admin
    .from('situatie_sms_uri')
    .insert({
      telefon,
      mesaj,
      cod_mesaj: 'cont_portal',
      status: amanat ? 'Amanat' : 'In curs de trimitere',
      data_planificata: localDateBucharest(sendAfter ? new Date(sendAfter) : now),
    })
    .select('id')
    .single()

  if (amanat) {
    // `sursa_id` = legătura prin care process-sms-amanate trece rândul pe 'Trimis'.
    const { error } = await admin.from('sms_amanate').insert({
      telefon,
      mesaj,
      tip: 'cont_portal',
      send_after: sendAfter,
      sursa_id: rand?.id ?? null,
    })
    if (error) {
      await marcheazaSms(admin, rand?.id, 'Esuat')
      return { plecat: false, amanat: false }
    }
    return { plecat: false, amanat: true }
  }

  try {
    const r = await sendSms(telefon, mesaj)
    // Un stub (lipsă credențiale / allowlist de test) NU e o trimitere.
    const plecat = r.ok && !r.stub
    await marcheazaSms(admin, rand?.id, plecat ? 'Trimis' : 'Esuat')
    return { plecat, amanat: false }
  } catch {
    await marcheazaSms(admin, rand?.id, 'Esuat')
    return { plecat: false, amanat: false }
  }
}

async function marcheazaSms(
  admin: SupabaseClient,
  id: string | undefined,
  status: 'Trimis' | 'Esuat',
): Promise<void> {
  if (!id) return
  const patch: Record<string, string> = { status }
  if (status === 'Trimis') patch.data_trimitere = localDateBucharest(new Date())
  await admin.from('situatie_sms_uri').update(patch).eq('id', id)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const auth = await requireStaffRole(req, STAFF_ROLES, admin)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

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
        .select('id, auth_user_id, telefon')
        .eq('id', targetId)
        .maybeSingle()
      if (exErr) return json({ error: exErr.message }, 400)
      if (!existing) return json({ error: `${table} inexistent` }, 404)
      if (existing.auth_user_id) return json({ error: 'are deja un cont de portal' }, 409)

      const email = body.email.trim().toLowerCase()
      const emailLuat = `Există deja un cont de portal pe emailul „${email}". Folosește alt email pentru această familie, sau resetează parola din profilul care deține deja contul.`

      let newId: string | null = null
      if (body.mustChange) {
        // Creează ȘI leagă într-o singură tranzacție, cu marcajul de parolă temporară
        // pornit: portal-auth nu emite tokenuri până nu își alege omul parola lui.
        const { data, error } = await admin.rpc('portal_create_account_temp', {
          p_email: email,
          p_password: body.password,
          p_familie_id: hasFamilie ? targetId : null,
          p_client_id: hasFamilie ? null : targetId,
        })
        if (error) {
          const luat = error.message.includes('email folosit deja')
          return json({ error: luat ? emailLuat : error.message }, luat ? 409 : 500)
        }
        newId = data as string
      } else {
        // Insert-only: întoarce null dacă emailul are deja un cont de portal.
        const { data, error: createErr } = await admin.rpc('portal_create_account', {
          p_email: email,
          p_password: body.password,
        })
        if (createErr) return json({ error: createErr.message }, 500)
        if (!data) return json({ error: emailLuat }, 409)
        newId = data as string

        const { error: linkErr } = await admin
          .from(table)
          .update({ auth_user_id: newId })
          .eq('id', targetId)
        if (linkErr) {
          // rollback contul orfan
          await admin.from('portal_accounts').delete().eq('id', newId)
          return json({ error: `legare eșuată: ${linkErr.message}` }, 500)
        }
      }

      const emailed = body.notify === 'email'
        ? await sendCredentialsEmail(email, body.password, body.mustChange)
        : undefined
      let smsSent: boolean | undefined
      let smsAmanat: boolean | undefined
      if (body.notify === 'sms') {
        const r = existing.telefon
          ? await sendCredentialsSms(admin, existing.telefon, email, body.password, body.mustChange)
          : { plecat: false, amanat: false }
        smsSent = r.plecat
        smsAmanat = r.amanat
      }
      return json({ user: { id: newId, email }, emailed, smsSent, smsAmanat })
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
      let smsSent: boolean | undefined
      let smsAmanat: boolean | undefined
      if (body.notify === 'sms') {
        // contul e legat fie de o familie, fie de un client → caută telefonul în ambele
        const [fam, cli] = await Promise.all([
          admin.from('familii').select('telefon').eq('auth_user_id', body.userId).maybeSingle(),
          admin.from('clienti').select('telefon').eq('auth_user_id', body.userId).maybeSingle(),
        ])
        const telefon = fam.data?.telefon ?? cli.data?.telefon ?? null
        const r = telefon
          ? await sendCredentialsSms(admin, telefon, acc.email, body.password)
          : { plecat: false, amanat: false }
        smsSent = r.plecat
        smsAmanat = r.amanat
      }
      return json({ ok: true, emailed, smsSent, smsAmanat })
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
