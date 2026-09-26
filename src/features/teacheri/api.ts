import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import { searchWords } from '@/lib/search'
import type { SelectOption } from '@/components/ui'
import type {
  Teacher,
  TeacherDetalii,
  Curs,
  VTeacherCursStats,
  InsertDto,
  UpdateDto,
} from '@/types/db'

// Datele private (contact, contract, salariu) stau în `teacheri_detalii`: fiecare
// instructor vede numele colegilor, dar nu și telefonul sau modelul lor salarial.
const DETALII_KEYS = [
  'data_nasterii',
  'telefon',
  'email',
  'link_contract',
  'observatii',
  'marime_tricou',
] as const
type DetaliiKey = (typeof DETALII_KEYS)[number]
type DetaliiFields = Pick<TeacherDetalii, DetaliiKey>

export type TeacherComplet = Omit<Teacher, DetaliiKey> & DetaliiFields
export type TeacherWrite = Omit<UpdateDto<'teacheri'>, DetaliiKey> & Partial<DetaliiFields>

const SELECT_COMPLET = '*, detalii:teacheri_detalii(*)'

type TeacherRaw = Teacher & { detalii: TeacherDetalii | null }

function aplatizeaza(r: TeacherRaw): TeacherComplet {
  const { detalii, ...rest } = r
  const det = Object.fromEntries(
    DETALII_KEYS.map((k) => [k, detalii?.[k] ?? null]),
  ) as DetaliiFields
  return { ...rest, ...det }
}

function splitDetalii(dto: TeacherWrite) {
  const base: Record<string, unknown> = {}
  const det: Partial<DetaliiFields> = {}
  for (const [k, v] of Object.entries(dto)) {
    if ((DETALII_KEYS as readonly string[]).includes(k)) {
      ;(det as Record<string, unknown>)[k] = v
    } else {
      base[k] = v
    }
  }
  return { base: base as UpdateDto<'teacheri'>, det }
}

async function upsertDetalii(teacherId: string, det: Partial<DetaliiFields>) {
  if (Object.keys(det).length === 0) return
  const { error } = await supabase
    .from('teacheri_detalii')
    .upsert({ teacher_id: teacherId, ...det }, { onConflict: 'teacher_id' })
  if (error) throw error
}

export const PAGE_SIZE = 25

const SEARCH_FIELDS = ['nume', 'prenume'] as const
const SEARCH_FIELDS_DETALII = ['telefon', 'email'] as const

export type TeacheriListParams = {
  search: string
  page: number
  locatieId?: string | null
  sezonId?: string | null
  /** Implicit arhivații sunt ascunși — pagina are un toggle pentru ei. */
  includeArhivati?: boolean
}

export type TeacheriListResult = {
  rows: TeacherComplet[]
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
    .eq('arhivat', false)
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
  includeArhivati,
}: TeacheriListParams): Promise<TeacheriListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('teacheri')
    .select(SELECT_COMPLET, { count: 'exact' })
    .order('nume', { ascending: true })
    .range(from, to)

  if (!includeArhivati) query = query.eq('arhivat', false)

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

  // Telefonul și emailul stau în satelit: pentru fiecare cuvânt, id-urile care-l
  // conțin acolo intră ca a treia alternativă lângă nume/prenume.
  for (const word of searchWords(search)) {
    const { data: hit, error: hitErr } = await supabase
      .from('teacheri_detalii')
      .select('teacher_id')
      .or(SEARCH_FIELDS_DETALII.map((f) => `${f}.ilike.%${word}%`).join(','))
    if (hitErr) throw hitErr
    const alternative = SEARCH_FIELDS.map((f) => `${f}.ilike.%${word}%`)
    const ids = (hit ?? []).map((r) => r.teacher_id)
    if (ids.length > 0) alternative.push(`id.in.(${ids.join(',')})`)
    query = query.or(alternative.join(','))
  }

  const { data, error, count } = await query
  if (error) throw error
  return {
    rows: ((data ?? []) as unknown as TeacherRaw[]).map(aplatizeaza),
    total: count ?? 0,
  }
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

export async function getTeacher(id: string): Promise<TeacherComplet> {
  const { data, error } = await supabase
    .from('teacheri')
    .select(SELECT_COMPLET)
    .eq('id', id)
    .single()
  if (error) throw error
  return aplatizeaza(data as unknown as TeacherRaw)
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

export async function createTeacher(
  dto: Omit<InsertDto<'teacheri'>, DetaliiKey> & Partial<DetaliiFields>,
): Promise<TeacherComplet> {
  const { base, det } = splitDetalii(dto)
  const { data, error } = await supabase
    .from('teacheri')
    .insert(base as InsertDto<'teacheri'>)
    .select('id')
    .single()
  if (error) throw error
  await upsertDetalii(data.id, det)
  return getTeacher(data.id)
}

export async function updateTeacher(
  id: string,
  dto: TeacherWrite,
): Promise<TeacherComplet> {
  const { base, det } = splitDetalii(dto)
  if (Object.keys(base).length > 0) {
    const { error } = await supabase.from('teacheri').update(base).eq('id', id)
    if (error) throw error
  }
  await upsertDetalii(id, det)
  return getTeacher(id)
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
