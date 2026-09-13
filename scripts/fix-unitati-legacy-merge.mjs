// Unește cele 5 denumiri tastate înainte de catalog cu intrările oficiale.
//
// Normalizarea din DB (`norm_unitate`) unește doar scrierile care diferă prin
// diacritice/punctuație/majuscule — „Valea lupului" = „Valea Lupului". Formele
// prescurtate („UMF", „Liceul teoretic Dimitrie") sunt alt șir de cuvinte, deci
// rămân intrări separate: le mapează un om, o singură dată.
//
// Repointarea se face scriind NUMELE canonic pe client — triggerul
// `clienti_unitate_canonic` reface legătura (`unitate_invatamant_id`). Abia apoi
// se poate șterge intrarea veche (FK).
//
// Rulare:  node scripts/fix-unitati-legacy-merge.mjs [--dry-run]

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

const dryRun = process.argv.includes('--dry-run')
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// vechi → canonic. Ultimele două sunt deducții (Cantemir e singurul „Liceul
// Teoretic Dimitrie…" din Iași; în Valea Lupului e o singură școală gimnazială).
const MAPARE = [
  ['UMF', 'Universitatea de Medicină și Farmacie „Grigore T. Popa” Iași'],
  ['UMF Iași', 'Universitatea de Medicină și Farmacie „Grigore T. Popa” Iași'],
  [
    'Liceul de Informatica Grigore Moisil Iasi',
    'Liceul Teoretic de Informatică „Grigore Moisil” Iași',
  ],
  ['Liceul teoretic Dimitrie', 'Liceul Teoretic „Dimitrie Cantemir” Iași'],
  ['Valea Lupului', 'Școala Gimnazială Valea Lupului'],
]

for (const [vechi, canonic] of MAPARE) {
  const { data: uVechi } = await db
    .from('unitati_invatamant')
    .select('id, nume')
    .eq('nume', vechi)
    .maybeSingle()
  if (!uVechi) {
    console.log(`— „${vechi}" nu mai există (deja unit)`)
    continue
  }
  const { data: uNou } = await db
    .from('unitati_invatamant')
    .select('id, nume')
    .eq('nume', canonic)
    .maybeSingle()
  if (!uNou) {
    console.error(`❌ Lipsește intrarea canonică „${canonic}" — rulează întâi seed-ul.`)
    process.exit(1)
  }

  const { data: clienti } = await db
    .from('clienti')
    .select('id, nume, prenume')
    .eq('unitate_invatamant_id', uVechi.id)

  console.log(
    `„${vechi}" → „${canonic}" (${clienti.length} client${clienti.length === 1 ? '' : 'i'}: ${clienti
      .map((c) => `${c.nume} ${c.prenume ?? ''}`.trim())
      .join(', ') || '—'})`,
  )
  if (dryRun) continue

  for (const c of clienti) {
    const { error } = await db
      .from('clienti')
      .update({ unitate_invatamant: canonic })
      .eq('id', c.id)
    if (error) throw error
  }
  const { error: eDel } = await db
    .from('unitati_invatamant')
    .delete()
    .eq('id', uVechi.id)
  if (eDel) throw eDel
}

const { data: ramase } = await db
  .from('unitati_invatamant')
  .select('nume')
  .eq('de_verificat', true)
console.log(
  dryRun
    ? '\n(dry-run — nu s-a scris nimic)'
    : `\n✅ Gata. Intrări rămase „de verificat": ${ramase.length}${
        ramase.length ? ' — ' + ramase.map((u) => u.nume).join(', ') : ''
      }`,
)
