import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/db'

export type ContractTemplate = Tables<'contract_templates'>
export type Contract = Tables<'contracte'>

export type ContractRow = Contract & {
  contract_templates: Pick<ContractTemplate, 'nume' | 'tip'> | null
  familii: { nume_familie: string; telefon: string | null } | null
  clienti: { nume: string; prenume: string | null } | null
}

export async function listTemplates(): Promise<ContractTemplate[]> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('activ', true)
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type ContracteListParams = {
  status?: string
  tip?: string
}

export async function listContracte(params: ContracteListParams): Promise<ContractRow[]> {
  let query = supabase
    .from('contracte')
    .select(
      '*, contract_templates(nume, tip), familii(nume_familie, telefon), clienti(nume, prenume)',
    )
    .order('created', { ascending: false })
    .limit(500)
  if (params.status) query = query.eq('status', params.status)
  if (params.tip) query = query.eq('contract_templates.tip', params.tip)
  const { data, error } = await query
  if (error) throw error
  let rows = (data ?? []) as ContractRow[]
  // filtrul pe tip via embedded resource nu elimină rândul, doar null-ează join-ul
  if (params.tip) rows = rows.filter((r) => r.contract_templates?.tip === params.tip)
  return rows
}

export type SendTarget = {
  familieId: string
  clientId?: string | null
  campanieId?: string | null
  cursTintaId?: string | null
}

export async function sendContracte(params: {
  templateId: string
  targets: SendTarget[]
}): Promise<Array<{ familieId: string; ok: boolean; error?: string; contractId?: string }>> {
  const { data, error } = await supabase.functions.invoke('contract-send', { body: params })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.results
}

// ============================================================
// Bulk pe campanie de reînscriere
// ============================================================

export type CampanieOption = { id: string; nume: string }

export async function listCampaniiDeschise(): Promise<CampanieOption[]> {
  const { data, error } = await supabase
    .from('campanii_reinscriere')
    .select('id, nume')
    .is('inchisa_la', null)
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type CampanieTarget = {
  client_id: string
  client_nume: string
  familie_id: string | null
  familie_nume: string | null
  telefon: string | null
  curs_tinta_id: string
  curs_nume: string
  act_status: string
  are_contract: boolean
}

export async function listTargetsCampanie(campanieId: string): Promise<CampanieTarget[]> {
  const { data, error } = await supabase.rpc('list_targets_campanie', {
    p_campanie_id: campanieId,
  })
  if (error) throw error
  return (data ?? []) as CampanieTarget[]
}

export async function anuleazaContract(id: string): Promise<void> {
  const { error } = await supabase
    .from('contracte')
    .update({ status: 'anulat' })
    .eq('id', id)
    .in('status', ['draft', 'trimis', 'deschis'])
  if (error) throw error
}

export async function getContractEvents(
  contractId: string,
): Promise<Array<{ id: number; tip: string; meta: Record<string, unknown> | null; created: string }>> {
  const { data, error } = await supabase
    .from('contract_events')
    .select('id, tip, meta, created')
    .eq('contract_id', contractId)
    .order('created')
  if (error) throw error
  return (data ?? []) as Array<{
    id: number
    tip: string
    meta: Record<string, unknown> | null
    created: string
  }>
}

export async function getPdfSignedUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from('contracte').createSignedUrl(storagePath, 300)
  return data?.signedUrl ?? null
}
