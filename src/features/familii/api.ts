import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Familie, FamilieFacturare, Client, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

// Câmpurile care stau în `familii_facturare` (doar staff), nu în `familii`.
const FACTURARE_KEYS = [
  'firma_denumire',
  'firma_cif',
  'firma_reg_com',
  'firma_adresa',
  'firma_banca',
  'firma_iban',
  'observatii',
] as const
type FacturareKey = (typeof FACTURARE_KEYS)[number]
type FacturareFields = Pick<FamilieFacturare, FacturareKey>

export type FamilieCompleta = Omit<Familie, FacturareKey> & FacturareFields
export type FamilieWrite = Omit<UpdateDto<'familii'>, FacturareKey> & Partial<FacturareFields>

function cuFacturare(fac: FamilieFacturare | null | undefined): FacturareFields {
  return Object.fromEntries(
    FACTURARE_KEYS.map((k) => [k, fac?.[k] ?? null]),
  ) as FacturareFields
}

function splitFacturare(dto: FamilieWrite) {
  const base: Record<string, unknown> = {}
  const fac: Partial<FacturareFields> = {}
  for (const [k, v] of Object.entries(dto)) {
    if ((FACTURARE_KEYS as readonly string[]).includes(k)) {
      fac[k as FacturareKey] = v as string | null
    } else {
      base[k] = v
    }
  }
  return { base: base as UpdateDto<'familii'>, fac }
}

async function upsertFacturare(familieId: string, fac: Partial<FacturareFields>) {
  if (Object.keys(fac).length === 0) return
  const { error } = await supabase
    .from('familii_facturare')
    .upsert({ familie_id: familieId, ...fac }, { onConflict: 'familie_id' })
  if (error) throw error
}

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
  rows: FamilieCompleta[]
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
    .select('*, facturare:familii_facturare(*)', { count: 'exact' })
    .order('nume_familie', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, SEARCH_FIELDS)

  const { data, error, count } = await query
  if (error) throw error
  type Raw = Familie & { facturare: FamilieFacturare | null }
  return {
    rows: ((data ?? []) as unknown as Raw[]).map(({ facturare, ...f }) => ({
      ...f,
      ...cuFacturare(facturare),
    })),
    total: count ?? 0,
  }
}

export async function getFamilie(id: string): Promise<FamilieCompleta> {
  const [fam, fac] = await Promise.all([
    supabase.from('familii').select('*').eq('id', id).single(),
    supabase.from('familii_facturare').select('*').eq('familie_id', id).maybeSingle(),
  ])
  if (fam.error) throw fam.error
  if (fac.error) throw fac.error
  return { ...fam.data, ...cuFacturare(fac.data) }
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
  dto: Omit<InsertDto<'familii'>, FacturareKey> & Partial<FacturareFields>,
): Promise<Familie> {
  const { base, fac } = splitFacturare(dto)
  const { data, error } = await supabase
    .from('familii')
    .insert(base as InsertDto<'familii'>)
    .select('*')
    .single()
  if (error) throw error
  if (Object.values(fac).some((v) => v != null)) await upsertFacturare(data.id, fac)
  return data
}

// Adultul fără familie devine reprezentantul propriei familii. DB-ul verifică vârsta
// și ține apoi numele, telefonul și emailul familiei sincron cu fișa clientului.
export async function creeazaFamilieProprie(
  clientId: string,
): Promise<{ id: string; nume: string }> {
  const { data, error } = await supabase.rpc('creeaza_familie_proprie', {
    p_client_id: clientId,
  })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Familia nu a fost creată.')
  return { id: row.familie_id, nume: row.familie_nume }
}

export async function updateFamilie(
  id: string,
  dto: FamilieWrite,
): Promise<void> {
  const { base, fac } = splitFacturare(dto)
  if (Object.keys(base).length > 0) {
    const { error } = await supabase.from('familii').update(base).eq('id', id)
    if (error) throw error
  }
  await upsertFacturare(id, fac)
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

export type FamilieLipsaActiune =
  | 'are_familie'
  | 'ataseaza'
  | 'familie_proprie'
  | 'familie_noua'
  | 'frate'
  | 'sare'
  | 'eroare'

export type FamilieLipsaPreview = {
  client_id: string
  client_nume: string
  data_nasterii: string | null
  categorie: 'adult' | 'minor' | 'fara_data'
  telefon: string | null
  email: string | null
  grupe: string[]
  actiune: FamilieLipsaActiune
  familie_id: string | null
  familie_nume: string | null
  reprezentant: string | null
  sursa_reprezentant: 'lead' | 'client' | null
  motiv: string | null
}

// Clienții cu înrolare în curs și fără familie, cu ce ar face generarea pentru fiecare.
export async function previewFamiliiLipsa(): Promise<FamilieLipsaPreview[]> {
  const { data, error } = await supabase.rpc('familii_lipsa_preview')
  if (error) throw error
  return (data ?? []) as FamilieLipsaPreview[]
}

export type FamilieLipsaRezultat = {
  client_id: string
  actiune: FamilieLipsaActiune
  familie_id: string | null
  familie_nume: string | null
  motiv: string | null
}

// Ordinea contează: frații se grupează pentru că al doilea găsește familia primului.
export async function genereazaFamiliiLipsa(clientIds: string[]): Promise<FamilieLipsaRezultat[]> {
  if (clientIds.length === 0) return []
  const { data, error } = await supabase.rpc('genereaza_familii_lipsa', { p_client_ids: clientIds })
  if (error) throw error
  return (data ?? []) as FamilieLipsaRezultat[]
}

export type FamilieAsigurata = {
  actiune: FamilieLipsaActiune
  id: string | null
  nume: string | null
  motiv: string | null
}

// Familia clientului, creată sau găsită după regula din DB (adult → proprie; minor →
// familia copilului; telefon deja pe o familie → se adaugă acolo). `id` null = n-a mers.
export async function asiguraFamilieClient(clientId: string): Promise<FamilieAsigurata> {
  const { data, error } = await supabase.rpc('asigura_familie_client', { p_client_id: clientId })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Familia nu a putut fi pregătită.')
  return {
    actiune: row.actiune as FamilieLipsaActiune,
    id: row.familie_id,
    nume: row.familie_nume,
    motiv: row.motiv,
  }
}
