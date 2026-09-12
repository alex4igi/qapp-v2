import { supabase } from '@/lib/supabase'

// Toate agregările stau în DB (migrațiile 20260913080000 + ...080100). Pagina nu
// trage niciodată rândurile brute: `enrollments` are ~46.000 de rânduri pentru că
// modelul scrie o linie pe lună, iar numărătoarea corectă e pe perechea client+curs.

export type StartSezonOption = {
  id: string
  numele_sezonului: string
  data_incepere: string
  stare: string | null
}

// Doar sezoanele principale: „Vara 2026" sau sezoanele secundare n-au start de sezon
// în sensul paginii ăsteia. Cel mai recent primul.
export async function listSezoanePrincipale(): Promise<StartSezonOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, data_incepere, stare')
    .eq('tip', 'principal')
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as StartSezonOption[]
}

export type StartSezonSumar = {
  inrolari: number
  grupe_total: number
  grupe_active: number
  pool_total: number
  pool_revenit: number
  clienti_noi: number
  reinscrieri: number
}

export async function getStartSezonSumar(
  sezonId: string,
): Promise<StartSezonSumar | null> {
  const { data, error } = await supabase.rpc('get_start_sezon_sumar', {
    p_sezon: sezonId,
  })
  if (error) throw error
  return ((data ?? [])[0] as StartSezonSumar) ?? null
}

export type StartSezonRetentieRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string
  total: number
  reveniti: number
}

export async function getStartSezonRetentie(
  sezonId: string,
): Promise<StartSezonRetentieRow[]> {
  const { data, error } = await supabase.rpc('get_start_sezon_retentie', {
    p_sezon: sezonId,
  })
  if (error) throw error
  return (data ?? []) as StartSezonRetentieRow[]
}

export type StartSezonNerevenitRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  status: string | null
  grupe: string | null
  ultima_luna: string | null
  suma_sezon: number | null
}

export async function getStartSezonNerevenit(
  sezonId: string,
): Promise<StartSezonNerevenitRow[]> {
  const { data, error } = await supabase.rpc('get_start_sezon_nerevenit', {
    p_sezon: sezonId,
  })
  if (error) throw error
  return (data ?? []) as StartSezonNerevenitRow[]
}

export type StartSezonNouRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  fisa_creata: string | null
  cursuri: string | null
}

export async function getStartSezonNoi(
  sezonId: string,
): Promise<StartSezonNouRow[]> {
  const { data, error } = await supabase.rpc('get_start_sezon_noi', {
    p_sezon: sezonId,
  })
  if (error) throw error
  return (data ?? []) as StartSezonNouRow[]
}

export type StartSezonRosterRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string
  teacher_nume: string
  facultativ: boolean
  capacitate: number | null
  inscrisi: number
  cat_r: number
  cat_s: number
  cat_v: number
  cat_n: number
}

export async function getStartSezonRoster(
  sezonId: string,
): Promise<StartSezonRosterRow[]> {
  const { data, error } = await supabase.rpc('get_start_sezon_roster', {
    p_sezon: sezonId,
  })
  if (error) throw error
  return (data ?? []) as StartSezonRosterRow[]
}
