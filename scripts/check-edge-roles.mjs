// Gardian: edge functions chemate din aplicația de staff trebuie să verifice ROLUL,
// nu doar semnătura tokenului. `verify_jwt = true` lasă să treacă și cheia publică
// `anon` (e un JWT valid semnat), iar tiparul vechi `role ?? 'front_desk'` promova
// la recepție orice cont fără rol. Vezi supabase/functions/_shared/staffAuth.ts.
//
// Rulează după orice atingere a unei edge functions de staff:  node scripts/check-edge-roles.mjs
// Creează două conturi temporare (teacher, manager), le folosește, le șterge.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const URL_BASE = `${env.VITE_SUPABASE_URL}/functions/v1`
const ANON = env.VITE_SUPABASE_ANON_KEY
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// `pozitiv: null` = funcția face treaba imediat ce trece de gard (process-sms-queue
// golește coada și trimite SMS-uri reale) — testăm doar refuzurile.
const CAZURI = [
  { fn: 'send-lead-sms', body: {}, pozitiv: 400 },
  { fn: 'process-sms-queue', body: {}, pozitiv: null },
  { fn: 'contract-send', body: {}, pozitiv: 400 },
  { fn: 'contract-resend', body: {}, pozitiv: 400 },
  { fn: 'contract-template-storage', body: { action: '__probe__' }, pozitiv: 400 },
  { fn: 'provision-client', body: { action: '__probe__' }, pozitiv: 400 },
  { fn: 'autofgo', body: { action: '__probe__' }, pozitiv: 400 },
  // admin-users cere manager+; un front_desk ar fi tot 403, deci contul „pozitiv"
  // de mai jos e manager pentru toate cazurile.
  { fn: 'admin-users', body: { action: '__probe__' }, pozitiv: 400 },
]

async function call(fn, token, body) {
  const res = await fetch(`${URL_BASE}/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.status
}

async function contTemporar(rol) {
  const email = `edgerole-${rol}-${Date.now()}@example.invalid`
  const parola = `Probe-${Math.random().toString(36).slice(2)}-2026`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: parola,
    email_confirm: true,
    app_metadata: { role: rol, locatie_id: null },
  })
  if (error) throw new Error(`nu pot crea contul ${rol}: ${error.message}`)
  const anonClient = createClient(env.VITE_SUPABASE_URL, ANON, {
    auth: { persistSession: false },
  })
  const { data: s, error: sErr } = await anonClient.auth.signInWithPassword({
    email,
    password: parola,
  })
  if (sErr) throw new Error(`nu pot loga contul ${rol}: ${sErr.message}`)
  return { id: data.user.id, token: s.session.access_token }
}

let teacher, manager
let esecuri = 0

try {
  teacher = await contTemporar('teacher')
  manager = await contTemporar('manager')

  for (const { fn, body, pozitiv } of CAZURI) {
    const cuAnon = await call(fn, ANON, body)
    const cuTeacher = await call(fn, teacher.token, body)
    const cuManager = pozitiv === null ? null : await call(fn, manager.token, body)

    const okAnon = cuAnon === 401 || cuAnon === 403
    const okTeacher = cuTeacher === 403
    const okManager = pozitiv === null ? true : cuManager === pozitiv

    if (!okAnon || !okTeacher || !okManager) esecuri++
    console.log(
      `${okAnon && okTeacher && okManager ? '✅' : '❌'} ${fn.padEnd(26)}` +
        ` anon=${cuAnon}${okAnon ? '' : ' (aștept 401/403)'}` +
        ` teacher=${cuTeacher}${okTeacher ? '' : ' (aștept 403)'}` +
        (pozitiv === null
          ? ' manager=sărit (ar executa acțiunea)'
          : ` manager=${cuManager}${okManager ? '' : ` (aștept ${pozitiv})`}`),
    )
  }
} finally {
  for (const c of [teacher, manager]) {
    if (c?.id) await admin.auth.admin.deleteUser(c.id)
  }
  console.log('conturi temporare șterse')
}

if (esecuri) {
  console.error(`\n${esecuri} funcții fără gard de rol corect.`)
  process.exit(1)
}
console.log('\nToate edge functions de staff verifică rolul.')
