import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import { applyWordSearch } from '@/lib/search'
import type {
  Teacher,
  Curs,
  SalariuTeacher,
  VTeacherCursStats,
  InsertDto,
  UpdateDto,
} from '@/types/db'

export type SalariuGrupa = {
  curs_id: string
  curs_nume: string
  tip: 'recurent' | 'facultativ' | 'trupa'
  sedinte_per_sapt: number
  nr_unitati: number | null
  prag_unitati_min: number | null
  suma: number
  manual: boolean
}

export type SalariuPreview = {
  teacher_id: string
  anul: number
  luna: number
  total: number
  grupe: SalariuGrupa[]
}

export const PAGE_SIZE = 25

const SEARCH_FIELDS = ['nume', 'prenume', 'telefon', 'email'] as const

export type TeacheriListParams = {
  search: string
  page: number
  locatieId?: string | null
}

export type TeacheriListResult = {
  rows: Teacher[]
  total: number
}

// Returnează teacherii care au cel puțin un curs (via cursuri_teacheri M:N)
// la o sală din locația dată. Folosit pentru filtrul de locație.
async function teacherIdsForLocatie(locatieId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('cursuri_teacheri')
    .select('teacher_id, cursuri!inner(sala, sali!inner(locatie))')
    .eq('cursuri.sali.locatie', locatieId)
  if (error) throw error
  const ids = new Set<string>()
  for (const r of (data ?? []) as Array<{ teacher_id: string }>) {
    ids.add(r.teacher_id)
  }
  return Array.from(ids)
}

export async function listTeacheri({
  search,
  page,
  locatieId,
}: TeacheriListParams): Promise<TeacheriListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('teacheri')
    .select('*', { count: 'exact' })
    .order('nume', { ascending: true })
    .range(from, to)

  if (locatieId) {
    const ids = await teacherIdsForLocatie(locatieId)
    if (ids.length === 0) {
      return { rows: [], total: 0 }
    }
    query = query.in('id', ids)
  }

  query = applyWordSearch(query, search, SEARCH_FIELDS)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getTeacher(id: string): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teacheri')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getTeacherCursuri(teacherId: string): Promise<Curs[]> {
  const { data, error } = await supabase
    .from('cursuri')
    .select('*')
    .eq('teacher', teacherId)
    .order('numele', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Tab Cursuri din profil teacher: stats per curs (Clienți activi, Înscriși, Balanța).
// Opțional filtrat la sezonul activ — dacă nu e furnizat, întoarce toate cursurile.
export async function getTeacherCursStats(
  teacherId: string,
  sezonId?: string | null,
): Promise<VTeacherCursStats[]> {
  let query = supabase
    .from('teacher_curs_stats')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('curs_nume', { ascending: true })
  if (sezonId) query = query.eq('curs_sezon', sezonId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// Preview LIVE pentru salariu (nu persistă)
export async function previewSalariuTeacher(
  teacherId: string,
  anul: number,
  luna: number,
): Promise<SalariuPreview> {
  const { data, error } = await supabase.rpc('calculeaza_salariu_teacher', {
    p_teacher: teacherId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as SalariuPreview
}

// Snapshot-uri salarii confirmate (admin sau teacher pe profilul lui)
export async function listSalariiTeacher(
  teacherId: string,
): Promise<SalariuTeacher[]> {
  const { data, error } = await supabase
    .from('salarii_teacher')
    .select('*')
    .eq('teacher', teacherId)
    .order('anul', { ascending: false })
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Admin: confirmă & persistă snapshot
export async function confirmaSalariuTeacher(
  teacherId: string,
  anul: number,
  luna: number,
): Promise<SalariuTeacher> {
  const { data, error } = await supabase.rpc('confirma_salariu_teacher', {
    p_teacher: teacherId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as SalariuTeacher
}

export async function createTeacher(
  dto: InsertDto<'teacheri'>,
): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teacheri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateTeacher(
  id: string,
  dto: UpdateDto<'teacheri'>,
): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teacheri')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Arhivare/dezarhivare instructor (`arhivat = true/false`). Manager+.
export async function toggleTeacherArchived(params: {
  teacherId: string
  archive: boolean
  motiv?: string
}): Promise<void> {
  const motiv = (params.motiv ?? '').trim()
  if (params.archive && !motiv) throw new Error('Motivul e obligatoriu la arhivare.')

  const { data: cur, error: gErr } = await supabase
    .from('teacheri')
    .select('id, arhivat')
    .eq('id', params.teacherId)
    .single()
  if (gErr) throw gErr

  const { error: uErr } = await supabase
    .from('teacheri')
    .update({ arhivat: params.archive, updated: new Date().toISOString() })
    .eq('id', params.teacherId)
  if (uErr) throw uErr

  await recordAuditLog({
    action: 'teacher_archived',
    entityType: 'teacher',
    entityId: params.teacherId,
    oldValue: { arhivat: cur.arhivat },
    newValue: { arhivat: params.archive },
    reason: motiv || (params.archive ? null : 'Dezarhivat'),
  })
}

export type CreateTeacherAccountResult = {
  user: { id: string; email: string }
}

// Cere edge function-ului `admin-users` să creeze un cont auth pentru instructor
// și să-l lege de rândul teacheri. Cere rol `admin` în JWT.
// `locatieId` e opțional pentru teacher — null = predă la mai multe locații.
export async function createTeacherAccount(params: {
  teacherId: string
  email: string
  password: string
  locatieId: string | null
}): Promise<CreateTeacherAccountResult> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'create',
      email: params.email,
      password: params.password,
      role: 'teacher',
      teacherId: params.teacherId,
      locatieId: params.locatieId,
    },
  })
  if (error) {
    type MaybeContext = { context?: { error?: string; message?: string } }
    const ctx = (error as unknown as MaybeContext).context
    throw new Error(ctx?.error ?? ctx?.message ?? error.message)
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error)
  }
  return data as CreateTeacherAccountResult
}
