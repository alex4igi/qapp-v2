import { supabase } from '@/lib/supabase'
import type { Prezenta, StatusPrezenta } from '@/types/db'

export type RosterRow = {
  enrollmentId: string
  clientId: string
  nume: string
  prenume: string | null
}

export async function getCursRoster(cursId: string): Promise<RosterRow[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, client(id, nume, prenume)')
    .eq('cursul', cursId)
    .eq('activ', true)
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    client: { id: string; nume: string; prenume: string | null } | null
  }>

  return rows
    .filter((r) => r.client)
    .map((r) => ({
      enrollmentId: r.id,
      clientId: r.client!.id,
      nume: r.client!.nume,
      prenume: r.client!.prenume,
    }))
    .sort((a, b) => a.nume.localeCompare(b.nume))
}

export async function getPrezente(
  enrollmentIds: string[],
  data: string,
): Promise<Prezenta[]> {
  if (enrollmentIds.length === 0) return []
  const { data: rows, error } = await supabase
    .from('prezente')
    .select('*')
    .in('enrollment', enrollmentIds)
    .eq('data', data)
  if (error) throw error
  return rows ?? []
}

export async function upsertPrezenta(params: {
  enrollmentId: string
  clientId: string
  data: string
  status: StatusPrezenta
}): Promise<void> {
  const { error } = await supabase.from('prezente').upsert(
    {
      enrollment: params.enrollmentId,
      client: params.clientId,
      data: params.data,
      status: params.status,
    },
    { onConflict: 'enrollment,data' },
  )
  if (error) throw error
}
