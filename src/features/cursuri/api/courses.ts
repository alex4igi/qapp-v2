import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import type { Curs, InsertDto, UpdateDto } from '@/types/db'

export async function getCurs(id: string): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createCurs(dto: InsertDto<'cursuri'>): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCurs(
  id: string,
  dto: UpdateDto<'cursuri'>,
): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Arhivare/dezarhivare curs (`suspendat = true/false`). Disponibil manager+.
// Audit log cu motiv obligatoriu la arhivare; la dezarhivare motivul e opțional.
export async function toggleCursArchived(params: {
  cursId: string
  archive: boolean
  motiv?: string
}): Promise<void> {
  const motiv = (params.motiv ?? '').trim()
  if (params.archive && !motiv) throw new Error('Motivul e obligatoriu la arhivare.')

  const { data: cur, error: gErr } = await supabase
    .from('cursuri')
    .select('id, suspendat, sala')
    .eq('id', params.cursId)
    .single()
  if (gErr) throw gErr

  let locatieId: string | null = null
  if (cur.sala) {
    const { data: sala } = await supabase
      .from('sali')
      .select('locatie')
      .eq('id', cur.sala)
      .single()
    locatieId = (sala as { locatie?: string } | null)?.locatie ?? null
  }

  const { error: uErr } = await supabase
    .from('cursuri')
    .update({ suspendat: params.archive, updated: new Date().toISOString() })
    .eq('id', params.cursId)
  if (uErr) throw uErr

  await recordAuditLog({
    action: 'curs_archived',
    entityType: 'curs',
    entityId: params.cursId,
    oldValue: { suspendat: cur.suspendat },
    newValue: { suspendat: params.archive },
    reason: motiv || (params.archive ? null : 'Dezarhivat'),
    locatieId,
  })
}
