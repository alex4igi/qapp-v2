import { parseCsv } from '@/lib/csv'
import { isValidRoMobile, normalizeTelefon } from '@/lib/phone'
import type { GrupaLead, InteresLead } from '@/types/db'
import { INTERESE, GRUPE } from './constants'

// Import CSV cu mapare de coloane. Antetul fișierului poate avea denumiri/ordine
// arbitrare: ghicim potrivirea automat (HEADER_ALIASES) și o lăsăm pe utilizator
// să o corecteze în modal. Coloana „Sursa" nu se mapează — sursa se alege per batch
// (e FK la campanii_promovare).

export type FieldKey =
  | 'nume'
  | 'prenume'
  | 'nume_parinte'
  | 'telefon'
  | 'email'
  | 'interes'
  | 'grupa_varsta'
  | 'observatii'

// Opțiunile din dropdown-ul de mapare (label RO). '' = ignoră coloana.
export const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'nume', label: 'Nume' },
  { value: 'prenume', label: 'Prenume' },
  { value: 'nume_parinte', label: 'Nume părinte' },
  { value: 'telefon', label: 'Telefon' },
  { value: 'email', label: 'Email' },
  { value: 'interes', label: 'Interes' },
  { value: 'grupa_varsta', label: 'Grupă' },
  { value: 'observatii', label: 'Observații' },
]

// Maparea unei coloane (după index în antet) la un câmp intern; '' = ignorată.
export type ColumnMapping = (FieldKey | '')[]

export type ParsedLeadRow = {
  idx: number // index în fișier (1-based, fără header)
  nume: string
  prenume: string | null
  nume_parinte: string | null
  telefon: string | null // E.164 dacă valid; altfel raw trimmed
  email: string | null
  interes: InteresLead | null
  grupa_varsta: GrupaLead | null
  observatii: string | null
  telefonValid: boolean
  warnings: string[]
  status: 'ok' | 'invalid' | 'duplicat'
  selected: boolean
}

function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

const HEADER_ALIASES: Record<string, FieldKey> = {
  nume: 'nume',
  numefamilie: 'nume',
  numecursant: 'nume',
  numecomplet: 'nume',
  prenume: 'prenume',
  numeparinte: 'nume_parinte',
  parinte: 'nume_parinte',
  telefon: 'telefon',
  tel: 'telefon',
  phone: 'telefon',
  mobil: 'telefon',
  numar: 'telefon',
  email: 'email',
  mail: 'email',
  interes: 'interes',
  curs: 'interes',
  cursinteres: 'interes',
  cursdorit: 'interes',
  grupa: 'grupa_varsta',
  grupavarsta: 'grupa_varsta',
  varsta: 'grupa_varsta',
  observatii: 'observatii',
  note: 'observatii',
  notite: 'observatii',
}

function matchEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  const n = normKey(value)
  return allowed.find((a) => normKey(a) === n) ?? null
}

export type CsvTable = { headers: string[]; rows: string[][] }

// Parsează textul CSV în antet + rânduri brute. Întoarce eroare dacă e gol.
export function readCsvTable(text: string): { table: CsvTable | null; error: string | null } {
  const all = parseCsv(text)
  if (all.length === 0) return { table: null, error: 'Fișier gol.' }
  if (all.length === 1)
    return { table: null, error: 'Fișierul are doar antetul, niciun rând de date.' }
  return { table: { headers: all[0], rows: all.slice(1) }, error: null }
}

// Ghicitul automat al mapării pe baza denumirilor din antet. Coloanele al căror
// câmp e deja folosit de o coloană anterioară rămân „ignoră" (evită dubla mapare).
export function autoMapColumns(headers: string[]): ColumnMapping {
  const used = new Set<FieldKey>()
  return headers.map((h) => {
    const field = HEADER_ALIASES[normKey(h)]
    if (field && !used.has(field)) {
      used.add(field)
      return field
    }
    return ''
  })
}

// Construiește rândurile validate din tabel + mapare (fără dedup; vezi markDuplicates).
export function buildRows(table: CsvTable, mapping: ColumnMapping): ParsedLeadRow[] {
  const colOf = (field: FieldKey): number => mapping.indexOf(field)
  const idxNume = colOf('nume')
  const idxPrenume = colOf('prenume')
  const idxParinte = colOf('nume_parinte')
  const idxTel = colOf('telefon')
  const idxEmail = colOf('email')
  const idxInteres = colOf('interes')
  const idxGrupa = colOf('grupa_varsta')
  const idxObs = colOf('observatii')
  const cell = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '')

  return table.rows.map((cells, r) => {
    const warnings: string[] = []
    const numeRaw = cell(cells, idxNume)
    const telRaw = cell(cells, idxTel)
    const telefonValid = telRaw ? isValidRoMobile(telRaw) : false
    if (telRaw && !telefonValid) warnings.push('Telefon invalid (nu e mobil RO)')

    const interesRaw = cell(cells, idxInteres)
    let interes: InteresLead | null = null
    if (interesRaw) {
      interes = matchEnum(interesRaw, INTERESE) as InteresLead | null
      if (!interes) warnings.push(`Interes necunoscut: „${interesRaw}"`)
    }
    const grupaRaw = cell(cells, idxGrupa)
    let grupa: GrupaLead | null = null
    if (grupaRaw) {
      grupa = matchEnum(grupaRaw, GRUPE)
      if (!grupa) warnings.push(`Grupă necunoscută: „${grupaRaw}"`)
    }

    const isInvalid = !numeRaw && !telefonValid
    if (isInvalid) warnings.push('Lipsește numele și un telefon valid')

    return {
      idx: r + 1,
      nume: numeRaw,
      prenume: cell(cells, idxPrenume) || null,
      nume_parinte: cell(cells, idxParinte) || null,
      telefon: telRaw ? (telefonValid ? normalizeTelefon(telRaw) : telRaw) : null,
      email: cell(cells, idxEmail) || null,
      interes,
      grupa_varsta: grupa,
      observatii: cell(cells, idxObs) || null,
      telefonValid,
      warnings,
      status: isInvalid ? 'invalid' : 'ok',
      selected: !isInvalid,
    }
  })
}

// Marchează duplicatele față de telefoanele existente în sistem ȘI în fișier.
export function markDuplicates(
  rows: ParsedLeadRow[],
  existingPhones: Set<string>,
): ParsedLeadRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    if (row.status === 'invalid' || !row.telefonValid || !row.telefon) return row
    const dup = existingPhones.has(row.telefon) || seen.has(row.telefon)
    seen.add(row.telefon)
    if (!dup) return row
    return {
      ...row,
      status: 'duplicat' as const,
      selected: false,
      warnings: [...row.warnings, 'Telefon deja în sistem'],
    }
  })
}
