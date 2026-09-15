import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import { fetchAllRows } from '@/lib/fetchAll'
import type { Enums } from '@/types/db'

export const PAGE_SIZE = 25

// Șir gol = filtru neaplicat.
export type PlatiFiltre = {
  search: string
  from: string
  to: string
  locatieId: string
  categorie: string
  metoda: string
}

export type PlataRow = {
  id: string
  data: string | null
  suma: number
  metoda: Enums<'metoda_plata'> | null
  categorie: Enums<'categorie_incasare'> | null
  observatii: string | null
  bucati: number | null
  locatie_nume: string | null
  client: string | null
  client_nume: string | null
  inregistrare: string | null
  curs_id: string | null
  curs_nume: string | null
  luna: string | null
  tip_plata: Enums<'tip_plata'> | null
  detalii: string | null
}

// Aceleași câmpuri caută și `sumar_incasari` pe server — schimbă-le împreună.
const SEARCH_FIELDS = ['client_nume', 'curs_nume', 'detalii', 'observatii'] as const

const COLS =
  'id, data, suma, metoda, categorie, observatii, bucati, locatie_nume, client, client_nume, inregistrare, curs_id, curs_nume, luna, tip_plata, detalii'

function plataQuery(f: PlatiFiltre, withCount: boolean) {
  let q = supabase
    .from('incasari_lista')
    .select(COLS, withCount ? { count: 'exact' } : undefined)
  if (f.from) q = q.gte('data', f.from)
  if (f.to) q = q.lte('data', f.to)
  if (f.locatieId) q = q.eq('locatie', f.locatieId)
  if (f.categorie) q = q.eq('categorie', f.categorie as Enums<'categorie_incasare'>)
  if (f.metoda) q = q.eq('metoda', f.metoda as Enums<'metoda_plata'>)
  q = applyWordSearch(q, f.search, SEARCH_FIELDS)
  return q
    .order('data', { ascending: false, nullsFirst: false })
    .order('created', { ascending: false })
    .order('id', { ascending: true })
}

function toRow(r: Record<string, unknown>): PlataRow {
  return { ...(r as unknown as PlataRow), id: r.id as string, suma: Number(r.suma ?? 0) }
}

export async function listPlati(params: {
  filtre: PlatiFiltre
  page: number
}): Promise<{ rows: PlataRow[]; total: number }> {
  const from = params.page * PAGE_SIZE
  const { data, error, count } = await plataQuery(params.filtre, true).range(
    from,
    from + PAGE_SIZE - 1,
  )
  if (error) throw error
  return { rows: (data ?? []).map(toRow), total: count ?? 0 }
}

// Paginat: peste max_rows (1000) exportul ar fi tăiat silențios.
export async function exportPlati(filtre: PlatiFiltre): Promise<PlataRow[]> {
  const data = await fetchAllRows(() => plataQuery(filtre, false))
  return data.map(toRow)
}

export type SumarPlati = {
  numar: number
  total: number
  pe_metoda: Record<string, number>
}

export async function getSumarPlati(filtre: PlatiFiltre): Promise<SumarPlati> {
  const { data, error } = await supabase.rpc('sumar_incasari', {
    p_search: filtre.search.trim() || undefined,
    p_from: filtre.from || undefined,
    p_to: filtre.to || undefined,
    p_locatie: filtre.locatieId || undefined,
    p_categorie: filtre.categorie || undefined,
    p_metoda: filtre.metoda || undefined,
  })
  if (error) throw error
  return data as unknown as SumarPlati
}
