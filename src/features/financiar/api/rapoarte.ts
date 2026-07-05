import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import type { Enums } from '@/types/db'

// Raportul pe zile din /financiar (încasări defalcate pe metodă + categorie,
// opțional cheltuieli/net).

export type RaportDimensiune = 'all' | 'locatie' | 'sala' | 'curs' | 'teacher'

export const RAPORT_DIMENSIUNI: { value: RaportDimensiune; label: string }[] = [
  { value: 'all',     label: 'Toate locațiile' },
  { value: 'locatie', label: 'Per locație' },
  { value: 'sala',    label: 'Per sală' },
  { value: 'curs',    label: 'Per curs' },
  { value: 'teacher', label: 'Per profesor' },
]

// Categoriile pe care defalcăm raportul pe zile (enum categorie_incasare).
// Etichetele cu diacritice se aplică la afișare (vezi RAPORT_CATEGORIE_LABEL).
export const CATEGORII_RAPORT = [
  'Abonament',
  'Bilet',
  'Merch',
  'Taxa',
  'Workshop',
  'Auditie',
] as const

export const RAPORT_CATEGORIE_LABEL: Record<string, string> = {
  Abonament: 'Abonament',
  Bilet: 'Bilet',
  Merch: 'Merch',
  Taxa: 'Taxă',
  Workshop: 'Workshop',
  Auditie: 'Audiție',
  Necunoscut: 'Necunoscut',
}

export type RaportZiRow = {
  data: string
  total: number
  cash: number
  card: number
  transfer: number
  revolut: number
  online: number
  // Sumă pe categorie (cheia = valoarea enum categorie_incasare, ex. 'Abonament').
  categorii: Record<string, number>
  cheltuieli: number
  net: number
}

export type RaportZileResult = {
  rows: RaportZiRow[]
  summary: RaportZiRow
}

export async function getRaportZile(params: {
  from: string
  to: string
  dimensiune: RaportDimensiune
  entityId: string
  // Front_desk nu vede niciodată cheltuieli/net; manager+ doar pe „Toate locațiile".
  includeCheltuieli: boolean
}): Promise<RaportZileResult> {
  // Paginat prin fetchAllRows: peste max_rows (1000) raportul ar fi trunchiat
  // silențios și totalurile ar minți.
  const data = await fetchAllRows(() => {
    let q = supabase
      .from('raport_incasari')
      .select('data, metoda, suma, categorie')
      .not('data', 'is', null)

    if (params.from) q = q.gte('data', params.from)
    if (params.to) q = q.lte('data', params.to)

    if (params.dimensiune !== 'all' && params.entityId) {
      const col = {
        locatie: 'id_locatie',
        sala: 'id_sala',
        curs: 'id_curs',
        teacher: 'id_teacher',
      }[params.dimensiune] as 'id_locatie' | 'id_sala' | 'id_curs' | 'id_teacher'
      q = q.eq(col, params.entityId)
    }
    return q.order('id', { ascending: true })
  })

  const empty = (d: string): RaportZiRow => ({
    data: d,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    revolut: 0,
    online: 0,
    categorii: {},
    cheltuieli: 0,
    net: 0,
  })

  const byDate = new Map<string, RaportZiRow>()
  const summary = empty('')
  for (const r of data) {
    if (!r.data) continue
    const row = byDate.get(r.data) ?? empty(r.data)
    const s = Number(r.suma ?? 0)
    row.total += s
    summary.total += s
    const key = metodaKey(r.metoda)
    if (key) {
      row[key] += s
      summary[key] += s
    }
    const cat = r.categorie ?? 'Necunoscut'
    row.categorii[cat] = (row.categorii[cat] ?? 0) + s
    summary.categorii[cat] = (summary.categorii[cat] ?? 0) + s
    byDate.set(r.data, row)
  }

  // Cheltuielile nu au atribuire pe locație/sală/curs/profesor, deci le afișăm
  // doar în raportul „Toate locațiile" (altfel netul ar amesteca venit filtrat
  // cu cheltuieli pe tot clubul).
  if (params.includeCheltuieli && params.dimensiune === 'all') {
    const chel = await fetchAllRows(() => {
      let cq = supabase
        .from('cheltuieli')
        .select('data, valoare')
        .not('data', 'is', null)
      if (params.from) cq = cq.gte('data', params.from)
      if (params.to) cq = cq.lte('data', params.to)
      return cq.order('id', { ascending: true })
    })
    for (const r of chel) {
      if (!r.data) continue
      const row = byDate.get(r.data) ?? empty(r.data)
      const v = Number(r.valoare ?? 0)
      row.cheltuieli += v
      summary.cheltuieli += v
      byDate.set(r.data, row)
    }
  }

  for (const row of byDate.values()) row.net = row.total - row.cheltuieli
  summary.net = summary.total - summary.cheltuieli

  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.data.localeCompare(b.data),
  )

  return { rows, summary }
}

function metodaKey(
  m: Enums<'metoda_plata'> | null,
): 'cash' | 'card' | 'transfer' | 'revolut' | 'online' | null {
  switch (m) {
    case 'Cash':     return 'cash'
    case 'Card':     return 'card'
    case 'Transfer': return 'transfer'
    case 'Revolut':  return 'revolut'
    case 'Online':   return 'online'
    default:         return null
  }
}
