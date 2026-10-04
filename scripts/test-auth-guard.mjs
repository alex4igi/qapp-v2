// Testează gardul trg_auth_users_require_role: signUp public trebuie să pice, createUser cu rol trebuie să meargă.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const url = env.VITE_SUPABASE_URL
const anon = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email = `sectest-${Date.now()}@quasardance.ro`

// 1) signUp cu cheia publică → așteptat: eroare (trigger)
const su = await anon.auth.signUp({ email, password: 'Parola-Test-123456' })
console.log('signUp public →', su.error ? `BLOCAT (${su.error.status}: ${su.error.message.slice(0,80)})` : `A TRECUT?! user=${su.data.user?.id}`)
if (!su.error && su.data.user?.id) { await admin.auth.admin.deleteUser(su.data.user.id); console.log('  (șters userul creat accidental)') }

// 2) createUser din admin, cu rol → așteptat: OK, apoi ștergem
const cu = await admin.auth.admin.createUser({ email: `sectest-admin-${Date.now()}@example.invalid`, password: 'Parola-Test-123456', email_confirm: true, app_metadata: { role: 'front_desk', locatie_id: null } })
console.log('createUser admin cu rol →', cu.error ? `EȘUAT (${cu.error.message.slice(0,100)})` : 'OK')
if (cu.data?.user?.id) { const d = await admin.auth.admin.deleteUser(cu.data.user.id); console.log('  șters:', d.error ? d.error.message : 'OK') }

// 3) createUser din admin FĂRĂ rol → așteptat: blocat
const cn = await admin.auth.admin.createUser({ email: `sectest-norole-${Date.now()}@example.invalid`, password: 'Parola-Test-123456', email_confirm: true })
console.log('createUser admin fără rol →', cn.error ? `BLOCAT (${cn.error.message.slice(0,80)})` : 'A TRECUT?!')
if (cn.data?.user?.id) { await admin.auth.admin.deleteUser(cn.data.user.id); console.log('  (șters)') }

const { data: u } = await admin.auth.admin.listUsers({ perPage: 200 })
console.log('conturi rămase în auth.users:', u.users.length, '| sectest rămase:', u.users.filter(x => x.email?.startsWith('sectest')).length)
