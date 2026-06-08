import { supabase } from '@/lib/supabase'
import type { CampanieReinscriere } from '@/types/db'
export type { CampanieReinscriere } from '@/types/db'

export type ReinscriereProgresRow = {
  curs_id: string
  curs_nume: string
  varsta: string | null
  total_eligibili: number
  activati: number
  ramasi: number
  procent: number
}

export type ReinscriereClientRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  activata: boolean
}

export async function getReinscrieriProgress(
  sezonTintaId: string,
): Promise<ReinscriereProgresRow[]> {
  const { data, error } = await supabase.rpc('get_reinscrieri_progress', {
    p_sezon_tinta: sezonTintaId,
  })
  if (error) throw error
  return (data ?? []) as ReinscriereProgresRow[]
}

export async function listReinscrieriClienti(
  cursTintaId: string,
): Promise<ReinscriereClientRow[]> {
  const { data, error } = await supabase.rpc('list_reinscrieri_clienti', {
    p_curs_tinta_id: cursTintaId,
  })
  if (error) throw error
  return (data ?? []) as ReinscriereClientRow[]
}

export async function activateReinscriereLaSezon(
  clientId: string,
  cursTintaId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    'activate_reinscriere_pe_sezon',
    { p_client_id: clientId, p_curs_tinta_id: cursTintaId },
  )
  if (error) throw error
  return (data as number) ?? 0
}

// ============================================================================
// Campanie de reînscrieri (admin) + porțile de validitate
// ============================================================================

export type CampanieProgres = {
  target_clienti: number
  re_inscrisi: number
  in_proces: number
  taxa_done: number
  act_done: number
  act_de_verificat: number
  procent: number
}

export type CampanieCursRow = {
  curs_id: string
  curs_nume: string
  varsta: string | null
  total_eligibili: number
  taxa_done: number
  act_done: number
  act_de_verificat: number
  ambele: number
  ramasi: number
  procent: number
  activi: number
  capacitate: number | null
  procent_ocupare: number | null
}

export type CampanieClientRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  taxa_platita_la: string | null
  act_status: string
  act_canal: string | null
  document_link: string | null
  esemneaza_request_id: string | null
  activat_la: string | null
}

export type CampanieStare = 'planificata' | 'activa' | 'procesare' | 'incheiata'

/** Stare derivată din date + inchisa_la (nu stocată). */
export function deriveCampanieStare(c: CampanieReinscriere): CampanieStare {
  if (c.inchisa_la) return 'incheiata'
  const today = new Date().toISOString().slice(0, 10)
  if (today < c.data_incepere) return 'planificata'
  if (today <= c.data_final) return 'activa'
  const fin = new Date(c.data_final)
  fin.setDate(fin.getDate() + (c.zile_procesare ?? 7))
  const finProc = fin.toISOString().slice(0, 10)
  if (today <= finProc) return 'procesare'
  return 'incheiata'
}

export async function getCampanieBySezon(
  sezonTintaId: string,
): Promise<CampanieReinscriere | null> {
  const { data, error } = await supabase
    .from('campanii_reinscriere')
    .select('*')
    .eq('sezon_tinta', sezonTintaId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createCampanieReinscriere(input: {
  sezonTintaId: string
  nume: string
  target: number
  taxa: number
  dataIncepere: string
  dataFinal: string
  zileProcesare?: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_campanie_reinscriere', {
    p_sezon_tinta: input.sezonTintaId,
    p_nume: input.nume,
    p_target: input.target,
    p_taxa: input.taxa,
    p_data_incepere: input.dataIncepere,
    p_data_final: input.dataFinal,
    p_zile_procesare: input.zileProcesare ?? 7,
  })
  if (error) throw error
  return data as string
}

export async function getCampanieProgress(
  campanieId: string,
): Promise<CampanieProgres | null> {
  const { data, error } = await supabase.rpc('get_campanie_progress', {
    p_campanie_id: campanieId,
  })
  if (error) throw error
  return ((data as CampanieProgres[]) ?? [])[0] ?? null
}

export async function getCampanieProgressCurs(
  campanieId: string,
): Promise<CampanieCursRow[]> {
  const { data, error } = await supabase.rpc('get_campanie_progress_curs', {
    p_campanie_id: campanieId,
  })
  if (error) throw error
  return (data ?? []) as CampanieCursRow[]
}

export async function listCampanieClientiCurs(
  campanieId: string,
  cursTintaId: string,
): Promise<CampanieClientRow[]> {
  const { data, error } = await supabase.rpc('list_campanie_clienti_curs', {
    p_campanie_id: campanieId,
    p_curs_tinta_id: cursTintaId,
  })
  if (error) throw error
  return (data ?? []) as CampanieClientRow[]
}

export async function recordTaxaRezervare(input: {
  campanieId: string
  clientId: string
  cursTintaId: string
  incasareId: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_taxa_rezervare', {
    p_campanie_id: input.campanieId,
    p_client_id: input.clientId,
    p_curs_tinta_id: input.cursTintaId,
    p_incasare_id: input.incasareId,
  })
  if (error) throw error
  return data as string
}

export async function setActAditionalManual(input: {
  campanieId: string
  clientId: string
  cursTintaId: string
  documentLink: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('set_act_aditional_manual', {
    p_campanie_id: input.campanieId,
    p_client_id: input.clientId,
    p_curs_tinta_id: input.cursTintaId,
    p_document_link: input.documentLink,
  })
  if (error) throw error
  return data as string
}

export async function approveActAditional(input: {
  campanieId: string
  clientId: string
  cursTintaId: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('approve_act_aditional', {
    p_campanie_id: input.campanieId,
    p_client_id: input.clientId,
    p_curs_tinta_id: input.cursTintaId,
  })
  if (error) throw error
  return data as string
}

export async function rejectActAditional(input: {
  campanieId: string
  clientId: string
  cursTintaId: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('reject_act_aditional', {
    p_campanie_id: input.campanieId,
    p_client_id: input.clientId,
    p_curs_tinta_id: input.cursTintaId,
  })
  if (error) throw error
  return data as string
}

export async function closeCampanieReinscriere(
  campanieId: string,
): Promise<void> {
  const { error } = await supabase.rpc('close_campanie_reinscriere', {
    p_campanie_id: campanieId,
  })
  if (error) throw error
}
