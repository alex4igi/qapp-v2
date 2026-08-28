import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { SelectOption } from '@/components/ui'
import type { Enums, VListaCursuri } from '@/types/db'
import { varstaCursOptions } from '@/lib/enums'

export const PAGE_SIZE = 25

export type CursuriListParams = {
  search: string
  page: number
  locatieId?: string | null
  sezonId?: string | null
  varsta?: Enums<'varsta_curs'> | null
  teacherId?: string | null
}

export type CursuriListResult = {
  rows: VListaCursuri[]
  total: number
}

export async function listCursuri({
  search,
  page,
  locatieId,
  sezonId,
  cursIds,
  varsta,
  teacherId,
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
  if (locatieId) query = query.eq('id_locatie', locatieId)
  if (sezonId) query = query.eq('sezon', sezonId)
  if (cursIds) query = query.in('id', cursIds)
  if (varsta) query = query.eq('varsta', varsta)
  // Titularul (cursuri.teacher), coloana din listă. Co-instructorii M:N nu intră.
  if (teacherId) query = query.eq('id_teacher', teacherId)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export type CursuriScope = {
  locatieId?: string | null
  sezonId?: string | null
  cursIds?: string[] | null
}

// Opțiunile pentru dropdown-urile de vârstă și teacher, derivate din CE E în
// selecția curentă (sezon + locația de lucru + scope-ul de teacher). Enum-ul
// complet de vârste și lista globală de teacheri ar oferi opțiuni moarte — ex.
// un teacher care predă doar la Nicolina, cu locația de lucru pe Ștefan cel Mare.
export async function listCursuriFilterOptions(
  s: CursuriScope,
): Promise<{ varste: SelectOption[]; teacheri: SelectOption[] }> {
  if (s.cursIds && s.cursIds.length === 0) return { varste: [], teacheri: [] }
  let query = supabase
    .from('lista_cursuri')
    .select('varsta, id_teacher, nume, prenume')
    .limit(2000)
  if (s.locatieId) query = query.eq('id_locatie', s.locatieId)
  if (s.sezonId) query = query.eq('sezon', s.sezonId)
  if (s.cursIds) query = query.in('id', s.cursIds)

  const { data, error } = await query
  if (error) throw error

  const varste = new Set<string>()
  const teacheri = new Map<string, string>()
  for (const r of data ?? []) {
    if (r.varsta) varste.add(r.varsta)
    if (r.id_teacher) {
      teacheri.set(r.id_teacher, `${r.nume} ${r.prenume ?? ''}`.trim())
    }
  }
  const byLabel = (a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, 'ro')
  return {
    // Vârstele în ordinea enum-ului (Tiny → Adults), nu alfabetic.
    varste: varstaCursOptions.filter((o) => varste.has(o.value)),
    teacheri: [...teacheri]
      .map(([value, label]) => ({ value, label }))
      .sort(byLabel),
  }
}
