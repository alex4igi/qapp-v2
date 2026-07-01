import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const parseEnv = (p) => Object.fromEntries(
  readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const env = parseEnv(fileURLToPath(new URL('file:///Users/alex_igi/Documents/Claude test/qapp v2/.env.local')))
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PHONE = '+40700000199'
// cleanup any leftover
await admin.from('leads').delete().eq('telefon', PHONE)
const { data, error } = await admin.from('leads').insert({
  prenume: 'ZZTEST', nume: 'Nurture Reactivare', telefon: PHONE,
  status: 'nurture', sub_status: null, nr_contactari: 5,
}).select('id, status, nr_contactari, telefon').single()
if (error) { console.error('ERR', error); process.exit(1) }
console.log('CREATED', JSON.stringify(data))
