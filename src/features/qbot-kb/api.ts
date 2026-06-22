import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type QbotKbRow = Database['public']['Tables']['qbot_kb']['Row']
export type QbotKbInsert = Database['public']['Tables']['qbot_kb']['Insert']
export type QbotKbUpdate = Database['public']['Tables']['qbot_kb']['Update']

export const AUDIENTE = ['staff', 'membri', 'ambele'] as const
export const CATEGORII = ['workflow', 'politica', 'contract', 'glosar'] as const
export const ROLURI = ['owner', 'admin', 'manager', 'teacher', 'front_desk'] as const

export async function listKb(): Promise<QbotKbRow[]> {
  const { data, error } = await supabase
    .from('qbot_kb')
    .select('*')
    .order('audienta', { ascending: true })
    .order('categorie', { ascending: true })
    .order('titlu', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createKb(dto: QbotKbInsert): Promise<void> {
  const { error } = await supabase.from('qbot_kb').insert(dto)
  if (error) throw error
}

export async function updateKb(id: string, dto: QbotKbUpdate): Promise<void> {
  const { error } = await supabase
    .from('qbot_kb')
    .update({ ...dto, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteKb(id: string): Promise<void> {
  const { error } = await supabase.from('qbot_kb').delete().eq('id', id)
  if (error) throw error
}
