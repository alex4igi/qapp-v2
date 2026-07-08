import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import { applyWordSearch } from '@/lib/search'
import type { SelectOption } from '@/components/ui'
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
  nr_prezente: number | null
  prag_unitati_min: number | null
  suma: number
  manual: boolean
  // Dual informativ: ambele modele calculate pentru orice grupă (snapshot-urile
  // vechi n-au câmpurile → null/undefined, UI-ul tratează absența).
  nr_cursanti?: number | null
  suma_per_client?: number | null
  prag_client_min?: number | null
  suma_per_prezente?: number | null
  prag_prezente_min?: number | null
}

export type ModelSalariu = 'per_client' | 'per_prezenta'

export type SalariuPreview = {
  teacher_id: string
  anul: number
  luna: number
  total: number
  total_prezente: number
  model_salariu: ModelSalariu | null
  grupe: SalariuGrupa[]
}

// Setează override-ul de model de salarizare per teacher (null = auto din facultativ).
export async function setModelSalariu(
  teacherId: string,
  model: ModelSalariu | null,
): Promise<void> {
  const { error } = await supabase
    .from('teacheri')
    .update({ model_salariu: model })
    .eq('id', teacherId)
  if (error) throw error
}

export const PAGE_SIZE = 25

const SEARCH_FIELDS = ['nume', 'prenume', 'telefon', 'email'] as const

export type TeacheriListParams = {
  search: string
  page: number
  locatieId?: string | null
  sezonId?: string | null
}

export type TeacheriListResult = {
  rows: Teacher[]
  total: number
}

// Id-urile teacherilor care predau cursuri ce satisfac filtrele de locație și/sau sezon.
// Teacherii n-au legătură directă cu locația/sezonul — o moștenesc prin cursuri:
//   curs.sezon (sezon) și curs.sala → sali.locatie (locație).
// Două surse, reunite: (1) titularul legacy `cursuri.teacher` — mereu populat;
// (2) co-trainerii din `cursuri_teacheri` (M:N). Sursa M:N e backfilled o singură dată
// la migrare, deci cursurile clonate ulterior pentru un sezon nou au doar titularul legacy —
// de aceea NU ne bazăm exclusiv pe M:N. Ambele filtre se aplică în aceeași interogare (AND).
async function teacherIdsForFilters(
  locatieId?: string | null,
  sezonId?: string | null,
): Promise<string[]> {
  const ids = new Set<string>()

  // Sursa 1: titular legacy (cursuri.teacher).
  {
    const sel: string = locatieId ? 'teacher, sali!inner(locatie)' : 'teacher'
    let q = supabase.from('cursuri').select(sel).not('teacher', 'is', null)
    if (sezonId) q = q.eq('sezon', sezonId)
    if (locatieId) q = q.eq('sali.locatie', locatieId)
    const { data, error } = await q
    if (error) throw error
    for (const r of (data ?? []) as unknown as Array<{ teacher: string | null }>) {
      if (r.teacher) ids.add(r.teacher)
    }
  }

  // Sursa 2: co-traineri (cursuri_teacheri M:N).
  {
    const sel: string = locatieId
      ? 'teacher_id, cursuri!inner(sezon, sali!inner(locatie))'
      : 'teacher_id, cursuri!inner(sezon)'
    let q = supabase.from('cursuri_teacheri').select(sel)
    if (sezonId) q = q.eq('cursuri.sezon', sezonId)
    if (locatieId) q = q.eq('cursuri.sali.locatie', locatieId)
    const { data, error } = await q
    if (error) throw error
    for (const r of (data ?? []) as unknown as Array<{ teacher_id: string }>) {
      ids.add(r.teacher_id)
    }
  }

  return Array.from(ids)
}

// Teacherii care nu predau NICIUN curs (în niciun sezon/locație) — ex. unul abia creat,
// neasignat încă. Îi includem în listă chiar când e activ un filtru de sezon/locație,
// altfel un teacher nou ar fi invizibil până i se asignează un curs.
async function teacherIdsFaraCursuri(): Promise<string[]> {
  const cuCursuri = new Set<string>()
  {
    const { data, error } = await supabase
      .from('cursuri')
      .select('teacher')
      .not('teacher', 'is', null)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ teacher: string | null }>) {
      if (r.teacher) cuCursuri.add(r.teacher)
    }
  }
  {
    const { data, error } = await supabase
      .from('cursuri_teacheri')
      .select('teacher_id')
    if (error) throw error
    for (const r of (data ?? []) as Array<{ teacher_id: string }>) {
      cuCursuri.add(r.teacher_id)
    }
  }
  const { data, error } = await supabase.from('teacheri').select('id')
  if (error) throw error
  return (data ?? [])
    .map((r) => r.id)
    .filter((id) => !cuCursuri.has(id))
}

// Opțiuni pentru selectoarele de teacher, restrânse la cei care predau cursuri
// în sezonul/locația dată (aceeași logică cu lista — vezi teacherIdsForFilters).
// Pentru cazul „fără filtru" folosește teacheriOptions() din lib/lookups.
export async function teacheriOptionsFiltrate(
  locatieId: string | null,
  sezonId: string | null,
): Promise<SelectOption[]> {
  const ids = await teacherIdsForFilters(locatieId, sezonId)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('teacheri')
    .select('id, nume, prenume')
    .in('id', ids)
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []).map((t) => ({
    value: t.id,
    label: `${t.nume} ${t.prenume ?? ''}`.trim(),
  }))
}

export async function listTeacheri({
  search,
  page,
  locatieId,
  sezonId,
}: TeacheriListParams): Promise<TeacheriListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('teacheri')
    .select('*', { count: 'exact' })
    .order('nume', { ascending: true })
    .range(from, to)

  if (locatieId || sezonId) {
    const [filtrati, faraCursuri] = await Promise.all([
      teacherIdsForFilters(locatieId, sezonId),
      teacherIdsFaraCursuri(),
    ])
    const ids = Array.from(new Set([...filtrati, ...faraCursuri]))
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

// Auth user-id-urile deja legate de un instructor (ca să nu le re-legăm).
export async function getLinkedAuthUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('teacheri')
    .select('auth_user_id')
    .not('auth_user_id', 'is', null)
  if (error) throw error
  return (data ?? [])
    .map((r) => r.auth_user_id)
    .filter((v): v is string => Boolean(v))
}

// Ștergere definitivă (admin). RPC-ul blochează dacă teacherul are dependențe
// (cursuri, salarii, evaluări, cont) și scrie în audit_log. Pentru teacheri creați
// din greșeală (fără dependențe) se șterge curat; altfel mesaj clar → arhivează.
// force=true sare peste gardă: șterge chiar dacă există dependențe (FK-urile le
// orfanizează). Adminul își asumă consecințele din UI.
export async function deleteTeacher(id: string, force = false): Promise<void> {
  const { error } = await supabase.rpc('delete_teacher_safe', { p_id: id, p_force: force })
  if (error) throw error
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
