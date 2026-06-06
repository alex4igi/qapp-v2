import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Client, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

const SEARCH_FIELDS = [
  'nume',
  'prenume',
  'email',
  'telefon',
  'telefonul_2',
] as const

export type ClientiListParams = {
  search: string
  page: number
}

export type ClientiListResult = {
  rows: Client[]
  total: number
}

export async function listClienti({
  search,
  page,
}: ClientiListParams): Promise<ClientiListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('clienti')
    .select('*', { count: 'exact' })
    .order('nume', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, SEARCH_FIELDS)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clienti')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export type ClientEnrollment = {
  id: string
  suma: number | null
  data_incepere: string | null
  tip_plata: string | null
  activ: boolean
  reziliat: boolean
  cursul: {
    id: string
    numele: string
    facultativ: boolean
    nivelul: string | null
  } | null
}

export async function getClientEnrollments(
  clientId: string,
): Promise<ClientEnrollment[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      'id, suma, data_incepere, tip_plata, activ, reziliat, cursul(id, numele, facultativ, nivelul)',
    )
    .eq('client', clientId)
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ClientEnrollment[]
}

export async function createClient(
  dto: InsertDto<'clienti'>,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clienti')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateClient(
  id: string,
  dto: UpdateDto<'clienti'>,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clienti')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type ClientFamilia = {
  id: string
  nume_familie: string
  nume_reprezentant: string | null
  prenume_reprezentant: string | null
}

export async function getClientFamilia(
  familiaId: string,
): Promise<ClientFamilia | null> {
  const { data, error } = await supabase
    .from('familii')
    .select('id, nume_familie, nume_reprezentant, prenume_reprezentant')
    .eq('id', familiaId)
    .maybeSingle()
  if (error) throw error
  return data
}

export type ClientInrolareSezon = {
  id_enrollment: string
  data_incepere: string
  tip_plata: string | null
  total_de_plata: number | null
  platit: number | null
  rest: number | null
  id_curs: string
  nume_curs: string
}

export async function getClientInrolariSezon(params: {
  clientId: string
  sezonStart: string
  sezonEnd: string
}): Promise<ClientInrolareSezon[]> {
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select(
      'id_enrollment, data_incepere, tip_plata, total_de_plata, platit, rest, id_curs, nume_curs',
    )
    .eq('id_cursant', params.clientId)
    .gte('data_incepere', params.sezonStart)
    .lte('data_incepere', params.sezonEnd)
    .order('data_incepere', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ClientInrolareSezon[]
}

export type ClientPrezentaSezon = {
  id: string
  data: string | null
  status: string | null
  cursul: { id: string; numele: string } | null
}

export async function getClientPrezenteSezon(params: {
  clientId: string
  sezonStart: string
  sezonEnd: string
}): Promise<ClientPrezentaSezon[]> {
  const { data, error } = await supabase
    .from('prezente')
    .select('id, data, status, enrollment(cursul(id, numele))')
    .eq('client', params.clientId)
    .gte('data', params.sezonStart)
    .lte('data', params.sezonEnd)
    .order('data', { ascending: false })
  if (error) throw error
  type Row = {
    id: string
    data: string | null
    status: string | null
    enrollment: { cursul: { id: string; numele: string } | null } | null
  }
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    data: r.data,
    status: r.status,
    cursul: r.enrollment?.cursul ?? null,
  }))
}
