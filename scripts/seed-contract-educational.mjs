// Seed IDEMPOTENT: template „Contract educațional grupă/trupă 2026-2027" pentru
// modulul de semnare electronică. Urcă PDF-ul real în bucketul privat + creează
// rândul `contract_templates` cu câmpurile plasate peste liniile punctate.
//
//   node scripts/seed-contract-educational.mjs
//
// Coordonatele sunt scrise mai jos în PUNCTE PDF (612x792, origine sus-stânga),
// extrase cu PyMuPDF direct din pozițiile cuvintelor/casetelor din document, și
// normalizate 0..1 la scriere — forma pe care o cere randarea din
// `contract-finalize` și editorul vizual. Le ținem în px pentru că așa pot fi
// verificate împotriva PDF-ului; conversia e o singură funcție, mai jos.
//
// Re-rulabil: suprascrie PDF-ul și actualizează fields DOAR cât timp template-ul
// nu e blocat (locked_at). După prima trimitere reală se clonează versiune nouă
// din editorul din /contracte → Șabloane.

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

const PDF_LOCAL = process.env.CONTRACT_PDF ??
  '/Users/alex_igi/Downloads/ sept 2026 -iunie 2027 QUASAR - CONTRACT EDUCAȚIONAL UNIT GRUPE&TRUPE-5 _semnat.pdf'
const STORAGE_PATH = 'contract_educational/2026-2027-grupe-trupe-v1.pdf'
const NUME = 'Contract educațional grupă/trupă 2026-2027'
const TIP = 'contract_educational'

const PAGE_W = 612
const PAGE_H = 792
// Înălțimea unei linii de text din document (pas măsurat între rânduri).
const LINE_H = 13.8

/** Câmp definit în puncte PDF; `y` e MARGINEA DE SUS a casetei, ca la randare. */
function box(px, py, pw, ph) {
  return { x: px / PAGE_W, y: py / PAGE_H, w: pw / PAGE_W, h: ph / PAGE_H }
}
/** Caseta unei linii de text: pornește cu 1pt deasupra scrisului. */
function line(px, pyTopOfWord, pw) {
  return box(px, pyTopOfWord - 1, pw, LINE_H)
}

const FIELDS = [
  // ---- Pagina 1 — 1.1 Beneficiar persoană fizică ----
  { key: 'semnatar_nume', label: 'Nume și prenume părinte/tutore', type: 'text',
    source: 'familie.reprezentant', required: true, editable: true, page: 1,
    ...line(226.8, 304.3, 228.0), fontSize: 9 },

  // Adresa e un singur text liber în DB, dar în document e spartă pe rubrici
  // (str./nr./bl./sc./et./ap./Jud.). O așezăm ca o bandă peste tot rândul, ca la
  // actul adițional: scrisul acoperă liniile punctate, etichetele rămân dedesubt.
  { key: 'adresa', label: 'Adresa de domiciliu (localitate, stradă, nr, bl, ap, județ)', type: 'text',
    source: 'familie.adresa', required: true, editable: true, page: 1,
    ...line(73.5, 318.1, 464.5), fontSize: 8 },

  { key: 'ci', label: 'Carte de identitate (serie și număr)', type: 'text',
    source: 'familie.ci', required: true, editable: true, page: 1,
    ...line(487.7, 331.9, 38.0), fontSize: 8 },
  { key: 'ci_eliberat_de', label: 'C.I. eliberată de', type: 'text',
    source: 'manual', required: false, editable: true, page: 1,
    ...line(195.8, 345.7, 75.0), fontSize: 8 },
  { key: 'ci_eliberat_la', label: 'C.I. eliberată la data de', type: 'date',
    source: 'manual', required: false, editable: true, page: 1,
    ...line(332.5, 345.7, 69.0), fontSize: 8 },
  { key: 'telefon', label: 'Telefon', type: 'text',
    source: 'familie.telefon', required: false, editable: false, page: 1,
    ...line(445.3, 345.7, 93.0), fontSize: 9 },
  { key: 'email', label: 'Email', type: 'text',
    source: 'familie.email', required: false, editable: false, page: 1,
    ...line(104.7, 359.5, 168.0), fontSize: 8 },

  // ---- Pagina 1 — 1.2 tabelul cursanților ----
  // Celula „Nume Familie Cursant" (rând 455.5-514.5). Nu există sursă pentru
  // numele de familie al grupului, deci rămâne manuală; se poate comuta pe altă
  // sursă din editor.
  { key: 'nume_familie', label: 'Nume familie cursant', type: 'text',
    source: 'manual', required: false, editable: true, page: 1,
    ...box(131.5, 470.0, 409.0, 30.0), fontSize: 11 },

  // `h` la copii_table e PASUL unui rând, nu înălțimea blocului de trei
  // (vezi comentariul din contract-finalize). Rândurile tabelului: 514.5,
  // 564.5, 614.5 — pas 50.
  //
  // Randarea scrie „Nume Prenume   data" ca UN singur șir aliniat la stânga, deci
  // nu poate umple coloane separate. Banda stă închisă în celula „Prenume
  // cursant" (131.5-250.5): textul se micșorează singur până încape, în loc să
  // calce peste eticheta tipărită „Data nașterii". Coloana „Locație & Grupa"
  // rămâne de completat manual.
  { key: 'copii', label: 'Cursanți (nume + data nașterii)', type: 'copii_table',
    source: 'copil.nume', required: false, editable: false, page: 1,
    ...box(133.0, 514.5, 115.0, 50.0), fontSize: 10 },

  // ---- Pagina 6 — semnătura contractului ----
  { key: 'data', label: 'Data încheierii', type: 'date',
    source: 'azi', required: false, editable: false, page: 6,
    ...line(309.1, 498.7, 63.0), fontSize: 10 },
  { key: 'nume_semnatura', label: 'Nume la semnătură', type: 'text',
    source: 'familie.reprezentant', required: false, editable: false, page: 6,
    ...box(405.0, 600.0, 133.0, 14.0), fontSize: 10 },
  { key: 'semnatura', label: 'Semnătura', type: 'signature',
    source: 'manual', required: true, editable: true, page: 6,
    ...box(410.0, 648.0, 125.0, 45.0) },

  // ---- Pagina 8 — Anexa 1 (oferta + calendar plăți) ----
  { key: 'nume_semnatura_a1', label: 'Nume la semnătură (Anexa 1)', type: 'text',
    source: 'familie.reprezentant', required: false, editable: false, page: 8,
    ...box(420.0, 477.5, 118.0, 11.0), fontSize: 9 },
  { key: 'semnatura_a1', label: 'Semnătura (Anexa 1)', type: 'signature',
    source: 'manual', required: false, editable: false, page: 8,
    ...box(425.0, 503.0, 113.0, 42.0) },

  // ---- Pagina 10 — Anexa 2 C: plecarea neînsoțită + contact de urgență ----
  { key: 'acord_neinsotit', label: 'DA — minorul poate pleca neînsoțit', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 10,
    ...box(108.0, 263.2, 26.2, 26.3), fontSize: 14 },
  { key: 'refuz_neinsotit', label: 'NU — minorul nu poate pleca neînsoțit', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 10,
    ...box(108.0, 310.5, 26.2, 26.3), fontSize: 14 },
  { key: 'urgenta_nume', label: 'Persoană de contact în caz de urgență — nume', type: 'text',
    source: 'manual', required: false, editable: true, page: 10,
    ...line(149.7, 514.2, 186.0), fontSize: 9 },
  { key: 'urgenta_telefon', label: 'Persoană de contact în caz de urgență — telefon', type: 'text',
    source: 'manual', required: false, editable: true, page: 10,
    ...line(401.3, 514.2, 108.0), fontSize: 9 },

  // ---- Pagina 11 — Anexa 2, folosirea imaginii ----
  { key: 'acord_imagine', label: 'DA — acord publicare imagini', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 11,
    ...box(98.2, 170.8, 26.3, 26.3), fontSize: 14 },
  { key: 'refuz_imagine', label: 'NU — fără publicare imagini', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 11,
    ...box(94.5, 228.6, 26.3, 26.2), fontSize: 14 },
  { key: 'semnatura_imagine', label: 'Semnătura (acord imagine)', type: 'signature',
    source: 'manual', required: false, editable: false, page: 11,
    ...box(129.7, 262.0, 120.0, 36.0) },

  // ---- Pagina 14 — Anexa 3, prelucrarea datelor ----
  { key: 'acord_gdpr', label: 'DA — acord prelucrare date/comunicări', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 14,
    ...box(101.2, 413.3, 26.3, 26.3), fontSize: 14 },
  { key: 'refuz_gdpr', label: 'NU — fără comunicări', type: 'checkbox',
    source: 'manual', required: false, editable: true, page: 14,
    ...box(101.2, 462.8, 26.3, 26.3), fontSize: 14 },
  { key: 'nume_semnatura_a3', label: 'Nume la semnătură (Anexa 3)', type: 'text',
    source: 'familie.reprezentant', required: false, editable: false, page: 14,
    ...box(420.0, 608.0, 118.0, 15.0), fontSize: 10 },
  { key: 'semnatura_a3', label: 'Semnătura (Anexa 3)', type: 'signature',
    source: 'manual', required: false, editable: false, page: 14,
    ...box(425.0, 658.0, 113.0, 42.0) },
]

async function main() {
  // `--dump` scoate doar câmpurile normalizate (folosit de previzualizarea locală
  // care verifică plasarea peste PDF înainte de a scrie ceva în DB).
  if (process.argv.includes('--dump')) {
    console.log(JSON.stringify(FIELDS, null, 1))
    return
  }

  const pdf = readFileSync(PDF_LOCAL)
  const { error: upErr } = await svc.storage
    .from('contracte-templates')
    .upload(STORAGE_PATH, pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) throw new Error(`upload: ${upErr.message}`)
  console.log(`PDF urcat: contracte-templates/${STORAGE_PATH} (${pdf.length} bytes)`)

  const { data: sezon } = await svc
    .from('sezoane').select('id, numele_sezonului').eq('activ', true).limit(1).maybeSingle()
  console.log(`Sezon: ${sezon?.numele_sezonului ?? '(niciunul activ)'}`)

  const { data: existing } = await svc
    .from('contract_templates')
    .select('id, locked_at, versiune')
    .eq('tip', TIP).eq('versiune', 1)
    .eq('sezon', sezon?.id ?? null)
    .maybeSingle()

  if (existing?.locked_at) {
    console.log(`Template BLOCAT (${existing.id}, locked_at=${existing.locked_at}).`)
    console.log('Nu-l ating. Clonează o versiune nouă din /contracte → Șabloane.')
    return
  }

  const row = {
    tip: TIP,
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
    if (error) throw new Error(`update: ${error.message}`)
    console.log(`Template ACTUALIZAT: ${existing.id} — ${FIELDS.length} câmpuri`)
  } else {
    const { data, error } = await svc
      .from('contract_templates').insert(row).select('id').single()
    if (error) throw new Error(`insert: ${error.message}`)
    console.log(`Template CREAT: ${data.id} — ${FIELDS.length} câmpuri`)
  }
  console.log('Rămâne DEBLOCAT (locked_at null): editabil din /contracte → Șabloane.')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
