import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { VListaCursuri } from '@/types/db'

export const PAGE_SIZE = 25

// Tipul cursului nu e o coloană: se derivă din facultativ + nivelul='Trupa'
// (aceeași regulă ca în CursForm — vezi components/CursForm/helpers.ts).
export type TipCursFilter = 'recurent' | 'recurent-trupa' | 'facultativ'

export type CursuriListParams = {
  search: string
  page: number
  locatieId?: string | null
  sezonId?: string | null
  tip?: TipCursFilter | null
  ora?: string | null
}

export type CursuriListResult = {
  rows: VListaCursuri[]
  total: number
}

type BaseFilters = {
  locatieId?: string | null
  sezonId?: string | null
  cursIds?: string[] | null
  tip?: TipCursFilter | null
  ora?: string | null
}

// Constrângere structurală (ca applyWordSearch): merge pe orice query builder.
type Filterable<Q> = {
  eq(column: string, value: unknown): Q
  in(column: string, values: readonly string[]): Q
  or(filter: string): Q
  contains(column: string, value: readonly string[]): Q
}

function applyFilters<Q extends Filterable<Q>>(query: Q, f: BaseFilters): Q {
  let q = query
  if (f.locatieId) q = q.eq('id_locatie', f.locatieId)
  if (f.sezonId) q = q.eq('sezon', f.sezonId)
  if (f.cursIds) q = q.in('id', f.cursIds)
  if (f.tip === 'facultativ') {
    q = q.eq('facultativ', true)
  } else if (f.tip === 'recurent-trupa') {
    q = q.eq('facultativ', false).eq('nivelul', 'Trupa')
  } else if (f.tip === 'recurent') {
    q = q.eq('facultativ', false).or('nivelul.is.null,nivelul.neq.Trupa')
  }
  // Cursurile cu orar diferit pe zile au mai multe ore de start: match pe oricare.
  if (f.ora) q = q.contains('ore_start', [f.ora])
  return q
}

export async function listCursuri({
  search,
  page,
  locatieId,
  sezonId,
  cursIds,
  tip,
  ora,
}: CursuriListParams & { cursIds?: string[] | null }): Promise<CursuriListResult> {
  if (cursIds && cursIds.length === 0) return { rows: [], total: 0 }
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('lista_cursuri')
    .select('*', { count: 'exact' })
    .order('locatie', { ascending: true, nullsFirst: false })
    .order('numele_cursului', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, ['numele_cursului'])
  query = applyFilters(query, { locatieId, sezonId, cursIds, tip, ora })

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// Orele de start prezente în selecția curentă (fără filtrul de oră), pentru
// dropdown. Interogare ieftină: o singură coloană, fără paginare.
export async function listOreStart(
  f: Omit<BaseFilters, 'ora'>,
): Promise<string[]> {
  if (f.cursIds && f.cursIds.length === 0) return []
  let query = supabase.from('lista_cursuri').select('ore_start').limit(2000)
  query = applyFilters(query, f)
  const { data, error } = await query
  if (error) throw error
  const set = new Set<string>()
  for (const r of data ?? []) for (const o of r.ore_start ?? []) set.add(o)
  return [...set].sort()
}
