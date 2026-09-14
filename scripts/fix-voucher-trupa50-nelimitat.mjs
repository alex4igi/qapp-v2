// TRUPA50 avea `numar_utilizari = 0`, iar validate_voucher_code tratează 0 drept „epuizat"
// (null = nelimitat, ca peste tot în cod: triggerele de decrement sar peste null, UI arată „—").
// Efect: membrii trupelor primeau „Voucherul nu mai are utilizări disponibile" la rezervarea
// unui OPEN. Deblocat 2026-09-12 pentru pilotul UNIQ. Restul voucherelor rămân pe 0 (decizie user).
//
// Rulare: node scripts/fix-voucher-trupa50-nelimitat.mjs [--dry-run]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const dry = process.argv.includes('--dry-run')

const { data: before } = await db.from('vouchere')
  .select('id, cod_voucher, tip, valoare, tip_enrollment, numar_utilizari, cerinta_eligibilitate')
  .eq('cod_voucher', 'TRUPA50').maybeSingle()
console.log('înainte:', before)

if (!dry && before) {
  const { data, error } = await db.from('vouchere')
    .update({ numar_utilizari: null }).eq('id', before.id)
    .select('cod_voucher, numar_utilizari')
  console.log(error ? `✗ ${error.message}` : '✓ după:', data)
}
