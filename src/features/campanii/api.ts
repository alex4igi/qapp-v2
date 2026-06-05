import { supabase } from '@/lib/supabase'
import type { CampaniePromovare, InsertDto, UpdateDto } from '@/types/db'

export type CampanieWithLeadCount = CampaniePromovare & {
  nr_leads: number
}

// Listează campaniile cu numărul de lead-uri atribuite fiecăreia.
export async function listCampanii(): Promise<CampanieWithLeadCount[]> {
  const { data, error } = await supabase
    .from('campanii_promovare')
    .select('*, leads(count)')
    .order('nume', { ascending: true })
  if (error) throw error
  type Row = CampaniePromovare & { leads: { count: number }[] | null }
  return ((data ?? []) as Row[]).map((c) => ({
    ...c,
    nr_leads: c.leads?.[0]?.count ?? 0,
  }))
}

export async function createCampanie(
  dto: InsertDto<'campanii_promovare'>,
): Promise<CampaniePromovare> {
  const { data, error } = await supabase
    .from('campanii_promovare')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCampanie(
  id: string,
  dto: UpdateDto<'campanii_promovare'>,
): Promise<CampaniePromovare> {
  const { data, error } = await supabase
    .from('campanii_promovare')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteCampanie(id: string): Promise<void> {
  const { error } = await supabase
    .from('campanii_promovare')
    .delete()
    .eq('id', id)
  if (error) throw error
}
