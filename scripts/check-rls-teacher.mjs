// Verifică invariantul de securitate al rolului `teacher` (4.6): ORICE tabel din
// schema public are RLS + o decizie explicită pentru instructor, marcată prin numele
// politicii restrictive:
//   teacher_scope       — filtrat pe grupele / elevii / rezervările lui
//   teacher_ok          — nomenclator sau tabel deja scopat de politicile lui
//   deny_teacher_direct — refuz total
//
// Fără decizie, un tabel nou e citibil de orice instructor: RLS-ul de bază dă
// `select using (true)` oricărui cont autentificat (vezi migrația rls_teacher_pe_grupa).
//
// Rulare:  node scripts/check-rls-teacher.mjs
// Exit 0 = totul acoperit; exit 1 = există tabele fără decizie (listate).
// DE RULAT după orice migrație care creează tabele noi.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL_ = env.VITE_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('lipsesc cheile în .env.local')

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const { data, error } = await svc.rpc('rls_teacher_gap_report')
if (error) throw new Error(`rls_teacher_gap_report: ${error.message}`)

if (!data || data.length === 0) {
  console.log('✅ Toate tabelele din public au RLS + o decizie pentru instructor.')
  process.exit(0)
}

console.log(`⚠️  ${data.length} tabele fără decizie pentru instructor:\n`)
for (const row of data) console.log(`  - ${row.tabel}: ${row.problema}`)
console.log(
  '\nFix: adaugă tabelul în migrația tabelului nou cu una dintre politicile de mai sus.' +
    '\nImplicit = deny_teacher_direct; teacher_scope doar dacă un ecran de instructor îl citește.',
)
process.exit(1)
