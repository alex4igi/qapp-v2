import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const parseEnv = (p) => Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const env = parseEnv(fileURLToPath(new URL('file:///Users/alex_igi/Documents/Claude test/qapp v2/.env.local')))
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data } = await admin.from('leads').select('id, prenume, nume, status, nr_contactari, sub_status').eq('telefon', '+40700000199').single()
console.log(JSON.stringify(data))
