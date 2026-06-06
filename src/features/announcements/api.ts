import { supabase } from '@/lib/supabase'
import { locatiiOptions } from '@/lib/lookups'
import type { SelectOption } from '@/components/ui'
import type { AppRole } from '@/hooks/useAuth'
import type { Anunt } from '@/types/db'

// ---- Staff: trimitere / preview ----

export type SendAnuntStaffParams = {
  titlu: string
  continut: string
  targetRoles: string[]
  targetLocatieIds: string[]
}

export async function previewAnuntStaff(
  targetRoles: string[],
  targetLocatieIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc('preview_anunt_staff', {
    p_target_roles: targetRoles,
    p_target_locatie_ids: targetLocatieIds,
  })
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function sendAnuntStaff(
  p: SendAnuntStaffParams,
): Promise<{ anunt_id: string; nr_destinatari: number }> {
  const { data, error } = await supabase.rpc('send_anunt_staff', {
    p_titlu: p.titlu,
    p_continut: p.continut,
    p_target_roles: p.targetRoles,
    p_target_locatie_ids: p.targetLocatieIds,
  })
  if (error) throw error
  return data as unknown as { anunt_id: string; nr_destinatari: number }
}

export async function markAnuntRead(anuntId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_anunt_read', { p_anunt_id: anuntId })
  if (error) throw error
}

// ---- Liste ----

export type AnuntTrimis = { anunt: Anunt; citite: number }

export async function listAnunturiTrimise(uid: string): Promise<AnuntTrimis[]> {
  const { data: anunturi, error } = await supabase
    .from('anunturi')
    .select('*')
    .eq('canal', 'staff')
    .eq('expeditor_user_id', uid)
    .order('created', { ascending: false })
  if (error) throw error
  const rows = (anunturi ?? []) as Anunt[]
  if (rows.length === 0) return []

  const ids = rows.map((a) => a.id)
  const { data: dest, error: e2 } = await supabase
    .from('anunturi_destinatari')
    .select('anunt_id, read_at')
    .in('anunt_id', ids)
  if (e2) throw e2

  const cititeByAnunt = new Map<string, number>()
  for (const d of dest ?? []) {
    if (d.read_at != null)
      cititeByAnunt.set(d.anunt_id, (cititeByAnunt.get(d.anunt_id) ?? 0) + 1)
  }
  return rows.map((a) => ({ anunt: a, citite: cititeByAnunt.get(a.id) ?? 0 }))
}

export type AnuntPrimit = { anunt: Anunt; read_at: string | null }

export async function listAnunturiPrimite(uid: string): Promise<AnuntPrimit[]> {
  const { data, error } = await supabase
    .from('anunturi_destinatari')
    .select('read_at, anunturi(*)')
    .eq('recipient_user_id', uid)
  if (error) throw error
  type Row = { read_at: string | null; anunturi: Anunt | null }
  const rows = (data as unknown as Row[]) ?? []
  return rows
    .filter((r) => r.anunturi != null)
    .map((r) => ({ anunt: r.anunturi as Anunt, read_at: r.read_at }))
    .sort((a, b) => b.anunt.created.localeCompare(a.anunt.created))
}

export async function getAnunt(id: string): Promise<Anunt | null> {
  const { data, error } = await supabase
    .from('anunturi')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Anunt | null) ?? null
}

export type ReadReceipts = { total: number; citite: number }

export async function getReadReceipts(anuntId: string): Promise<ReadReceipts> {
  const { data, error } = await supabase
    .from('anunturi_destinatari')
    .select('read_at')
    .eq('anunt_id', anuntId)
  if (error) throw error
  const rows = data ?? []
  return {
    total: rows.length,
    citite: rows.filter((r) => r.read_at != null).length,
  }
}

// ---- Opțiuni locații constrânse pe scopul expeditorului ----
// admin/owner → toate; manager/front_desk → locația proprie; teacher → locațiile unde predă.
export async function myAnuntLocatieOptions(
  role: AppRole,
  locatieId: string | null,
): Promise<SelectOption[]> {
  const all = await locatiiOptions()
  if (role === 'admin' || role === 'owner') return all

  if (role === 'teacher') {
    const { data: tId } = await supabase.rpc('current_teacher_id')
    const teacherId = (tId as unknown as string | null) ?? null
    const set = new Set<string>()
    if (teacherId) {
      const { data: m2m } = await supabase
        .from('cursuri_teacheri')
        .select('cursuri:cursuri!cursuri_teacheri_curs_id_fkey(locatie)')
        .eq('teacher_id', teacherId)
      type M2MRow = { cursuri: { locatie: string | null } | null }
      for (const r of (m2m as unknown as M2MRow[]) ?? []) {
        if (r.cursuri?.locatie) set.add(r.cursuri.locatie)
      }
      const { data: legacy } = await supabase
        .from('cursuri')
        .select('locatie')
        .eq('teacher', teacherId)
      for (const r of legacy ?? []) {
        if (r.locatie) set.add(r.locatie)
      }
    }
    if (locatieId) set.add(locatieId)
    return all.filter((o) => set.has(o.value))
  }

  // manager, front_desk
  return locatieId ? all.filter((o) => o.value === locatieId) : []
}
