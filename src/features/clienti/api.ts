import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Client, InsertDto, UpdateDto, Enums, DocumentClient } from '@/types/db'

export const PAGE_SIZE = 25

export type CanalContact = Enums<'canal_contact'>
export type RezultatContact = Enums<'rezultat_contact'>

// Loghează un contact de reactivare pe un client inactiv (alimentează
// scorecard-ul Faza 3). „Reactivat" se determină din prezențe reale ulterioare
// (vezi get_scorecard_reactivari), nu de aici.
export async function logReactivareContact(input: {
  clientId: string
  canal: CanalContact
  rezultat: RezultatContact
  observatii?: string
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('client_contacte').insert({
    client_id: input.clientId,
    user_id: user?.id,
    canal: input.canal,
    rezultat: input.rezultat,
    scop: 'reactivare',
    observatii: input.observatii?.trim() || null,
  })
  if (error) throw error
}

const SEARCH_FIELDS = [
  'nume',
  'prenume',
  'email',
  'telefon',
  'telefonul_2',
] as const

// Checklistul „Completare fișă" are un item care se citește din documente, nu
// din rândul clientului (contractul stă în `documente_client` din 1 sept 2026).
// Îl aducem cu embed ca lista și profilul să evalueze checklistul fără query
// companion — câteva sute de rânduri în total, costul e neglijabil.
const DOCS_EMBED = 'documente:documente_client(tip)'

export type ClientCuDocumente = Client & {
  documente: { tip: Enums<'tip_document'> }[]
}

export type ClientiListParams = {
  search: string
  page: number
  status?: string | null
}

export type ClientiListResult = {
  rows: ClientCuDocumente[]
  total: number
}

export async function listClienti({
  search,
  page,
  status,
}: ClientiListParams): Promise<ClientiListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('clienti')
    .select(`*, ${DOCS_EMBED}`, { count: 'exact' })
    .order('nume', { ascending: true })
    .range(from, to)

  if (status) query = query.eq('status', status as Enums<'status_client'>)
  query = applyWordSearch(query, search, SEARCH_FIELDS)

  const { data, error, count } = await query
  if (error) throw error
  return {
    rows: (data ?? []) as unknown as ClientCuDocumente[],
    total: count ?? 0,
  }
}

export async function getClient(id: string): Promise<ClientCuDocumente> {
  const { data, error } = await supabase
    .from('clienti')
    .select(`*, ${DOCS_EMBED}`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as ClientCuDocumente
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

// ── Documente client (faza 1: linkuri Google Drive) ───────────────────────
export async function listDocumenteClient(
  clientId: string,
): Promise<DocumentClient[]> {
  const { data, error } = await supabase
    .from('documente_client')
    .select('*')
    .eq('client', clientId)
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createDocumentClient(
  dto: InsertDto<'documente_client'>,
): Promise<DocumentClient> {
  const { data, error } = await supabase
    .from('documente_client')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteDocumentClient(id: string): Promise<void> {
  const { error } = await supabase.from('documente_client').delete().eq('id', id)
  if (error) throw error
}
