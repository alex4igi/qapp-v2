import { supabase } from '@/lib/supabase'
import type { Familie, Client, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

const SEARCH_FIELDS = [
  'nume_familie',
  'nume_reprezentant',
  'prenume_reprezentant',
  'email',
  'telefon',
  'telefon_2',
] as const

export type FamiliiListParams = {
  search: string
  page: number
}

export type FamiliiListResult = {
  rows: Familie[]
  total: number
}

export async function listFamilii({
  search,
  page,
}: FamiliiListParams): Promise<FamiliiListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('familii')
    .select('*', { count: 'exact' })
    .order('nume_familie', { ascending: true })
    .range(from, to)

  const term = search.trim()
  if (term) {
    const orFilter = SEARCH_FIELDS.map((f) => `${f}.ilike.%${term}%`).join(',')
    query = query.or(orFilter)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getFamilie(id: string): Promise<Familie> {
  const { data, error } = await supabase
    .from('familii')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getFamilieMembers(familieId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clienti')
    .select('*')
    .eq('familia', familieId)
    .order('nume', { ascending: true })
  if (error) throw error
  return data ?? []
}

export type ClientForFamilieAssign = {
  id: string
  nume: string
  prenume: string | null
  familia: string | null
  familia_nume: string | null
}

// Listează toți clienții (cu numele familiei curente dacă e cazul) pentru
// selecția membrilor în modalul „Adaugă membru".
export async function listClientiForFamilieAssign(): Promise<
  ClientForFamilieAssign[]
> {
  const { data, error } = await supabase
    .from('clienti')
    .select('id, nume, prenume, familia, familia_rel:familii!fk_clienti_familia(nume_familie)')
    .order('nume', { ascending: true })
  if (error) throw error
  type Row = {
    id: string
    nume: string
    prenume: string | null
    familia: string | null
    familia_rel: { nume_familie: string } | null
  }
  return (data as unknown as Row[]).map((c) => ({
    id: c.id,
    nume: c.nume,
    prenume: c.prenume,
    familia: c.familia,
    familia_nume: c.familia_rel?.nume_familie ?? null,
  }))
}

// Setează clienții cu id-urile date la o familie (sau scoate dacă familieId=null).
export async function assignClientiToFamilie(params: {
  clientIds: string[]
  familieId: string | null
}): Promise<void> {
  if (params.clientIds.length === 0) return
  const { error } = await supabase
    .from('clienti')
    .update({ familia: params.familieId })
    .in('id', params.clientIds)
  if (error) throw error
}

export async function createFamilie(
  dto: InsertDto<'familii'>,
): Promise<Familie> {
  const { data, error } = await supabase
    .from('familii')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateFamilie(
  id: string,
  dto: UpdateDto<'familii'>,
): Promise<Familie> {
  const { data, error } = await supabase
    .from('familii')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type FamilieInrolareSezon = {
  id_enrollment: string
  data_incepere: string
  tip_plata: string | null
  total_de_plata: number | null
  platit: number | null
  rest: number | null
  id_curs: string
  nume_curs: string
  id_cursant: string
  nume_client: string | null
  prenume_client: string | null
}

export async function getFamilieInrolariSezon(params: {
  familieId: string
  sezonStart: string
  sezonEnd: string
}): Promise<FamilieInrolareSezon[]> {
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select(
      'id_enrollment, data_incepere, tip_plata, total_de_plata, platit, rest, id_curs, nume_curs, id_cursant, nume_client, prenume_client',
    )
    .eq('id_familie', params.familieId)
    .gte('data_incepere', params.sezonStart)
    .lte('data_incepere', params.sezonEnd)
    .order('data_incepere', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as FamilieInrolareSezon[]
}
