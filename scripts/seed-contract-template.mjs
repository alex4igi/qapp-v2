// Seed IDEMPOTENT: template contract „Act adițional 2026-2027" pentru modulul
// de semnare electronică. Urcă PDF-ul real în bucketul privat + creează rândul
// contract_templates cu câmpurile plasate pe coordonate normalizate (0..1, origine
// sus-stânga; extrase cu pdfminer din PDF-ul sursă).
//
//   node scripts/seed-contract-template.mjs
//
// Re-rulabil: suprascrie PDF-ul și actualizează fields DOAR dacă template-ul nu
// e blocat (locked_at) — după prima trimitere reală, rulează cu versiune nouă.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const PDF_LOCAL = new URL(
  '../../qapp-membri/Netopia/2026_2027_QUASAR_STUDIO_AA_PREL_CONTRACT_EDUCATIONAL_SEPT_2025_var.pdf',
  import.meta.url,
)
const STORAGE_PATH = 'act_aditional/2026-2027-v1.pdf'
const NUME = 'Act adițional contract educațional 2026-2027'

// Coordonate normalizate (pagina 612x792), origine SUS-STÂNGA.
const FIELDS = [
  { key: 'semnatar_nume', label: 'Nume și prenume părinte/tutore', type: 'text', source: 'familie.reprezentant', required: true, editable: true, page: 1, x: 0.345, y: 0.404, w: 0.36, h: 0.02, fontSize: 9 },
  { key: 'adresa', label: 'Adresa de domiciliu (stradă, nr, bl, ap, județ)', type: 'text', source: 'familie.adresa', required: true, editable: true, page: 1, x: 0.13, y: 0.422, w: 0.74, h: 0.02, fontSize: 8 },
  { key: 'ci', label: 'Carte de identitate (serie și număr)', type: 'text', source: 'familie.ci', required: true, editable: true, page: 1, x: 0.71, y: 0.438, w: 0.2, h: 0.02, fontSize: 9 },
  { key: 'cnp', label: 'CNP', type: 'text', source: 'familie.cnp', required: true, editable: true, page: 1, x: 0.575, y: 0.456, w: 0.2, h: 0.02, fontSize: 9 },
  { key: 'telefon', label: 'Telefon', type: 'text', source: 'familie.telefon', required: false, editable: false, page: 1, x: 0.13, y: 0.473, w: 0.15, h: 0.02, fontSize: 9 },
  { key: 'email', label: 'Email', type: 'text', source: 'familie.email', required: false, editable: false, page: 1, x: 0.335, y: 0.473, w: 0.3, h: 0.02, fontSize: 9 },
  { key: 'copii', label: 'Cursanți', type: 'copii_table', source: 'copil.nume', required: false, editable: false, page: 1, x: 0.22, y: 0.635, w: 0.45, h: 0.063, fontSize: 9 },
  { key: 'data', label: 'Data încheierii', type: 'date', source: 'azi', required: false, editable: false, page: 3, x: 0.52, y: 0.712, w: 0.15, h: 0.02, fontSize: 10 },
  { key: 'nume_semnatura', label: 'Nume la semnătură', type: 'text', source: 'familie.reprezentant', required: false, editable: false, page: 3, x: 0.58, y: 0.808, w: 0.32, h: 0.02, fontSize: 10 },
  { key: 'semnatura', label: 'Semnătura', type: 'signature', source: 'manual', required: true, editable: true, page: 3, x: 0.58, y: 0.862, w: 0.22, h: 0.055 },
  { key: 'nume_semnatura_p6', label: 'Nume la semnătură (anexă)', type: 'text', source: 'familie.reprezentant', required: false, editable: false, page: 6, x: 0.62, y: 0.356, w: 0.3, h: 0.02, fontSize: 10 },
  { key: 'semnatura_p6', label: 'Semnătura (anexă)', type: 'signature', source: 'manual', required: false, editable: false, page: 6, x: 0.62, y: 0.395, w: 0.22, h: 0.05 },
]

async function main() {
  // 1) upload PDF (upsert)
  const pdf = readFileSync(PDF_LOCAL)
  const { error: upErr } = await svc.storage
    .from('contracte-templates')
    .upload(STORAGE_PATH, pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) throw new Error(`upload: ${upErr.message}`)
  console.log(`PDF urcat: contracte-templates/${STORAGE_PATH} (${pdf.length} bytes)`)

  // 2) sezonul activ (opțional)
  const { data: sezon } = await svc
    .from('sezoane')
    .select('id, numele_sezonului')
    .eq('activ', true)
    .limit(1)
    .maybeSingle()

  // 3) upsert template (idempotent pe tip+nume, doar dacă nu e blocat)
  const { data: existing } = await svc
    .from('contract_templates')
    .select('id, locked_at')
    .eq('tip', 'act_aditional')
    .eq('nume', NUME)
    .maybeSingle()

  if (existing?.locked_at) {
    console.log(`Template existent și BLOCAT (${existing.id}) — nu ating fields. Creează versiune nouă dacă vrei modificări.`)
    return
  }

  const row = {
    tip: 'act_aditional',
    sezon: sezon?.id ?? null,
    nume: NUME,
    versiune: 1,
    pdf_storage_path: STORAGE_PATH,
    fields: FIELDS,
    activ: true,
    valabilitate_zile: 30,
  }

  if (existing) {
    const { error } = await svc.from('contract_templates').update(row).eq('id', existing.id)
    if (error) throw new Error(error.message)
    console.log(`Template actualizat: ${existing.id}`)
  } else {
    const { data, error } = await svc.from('contract_templates').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    console.log(`Template creat: ${data.id}`)
  }
  console.log(`Sezon: ${sezon?.numele_sezonului ?? '(fără)'} · ${FIELDS.length} câmpuri`)
}

main().catch((e) => { console.error(e); process.exit(1) })
