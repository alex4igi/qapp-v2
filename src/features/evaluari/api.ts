import { supabase } from '@/lib/supabase'
import { matchesWords } from '@/lib/search'
import { endOfMonth } from '@/features/plati/api/calendar'
import type { Evaluare, InsertDto, UpdateDto } from '@/types/db'
import type { SelectOption } from '@/components/ui'

export const PAGE_SIZE = 25

export type EvaluareWithRefs = Evaluare & {
  client_row: { id: string; nume: string; prenume: string | null } | null
  curs_row: { id: string; numele: string } | null
  teacher_row: { id: string; nume: string; prenume: string | null } | null
}

export type EvaluariListParams = {
  search: string
  cursId: string
  teacherId: string
  sezonId: string
  page: number
}

export type EvaluariListResult = {
  rows: EvaluareWithRefs[]
  total: number
}

export async function listEvaluari({
  search,
  cursId,
  teacherId,
  sezonId,
  page,
}: EvaluariListParams): Promise<EvaluariListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('evaluari')
    .select(
      '*, client_row:clienti!evaluari_client_fkey(id, nume, prenume), curs_row:cursuri!evaluari_cursul_fkey(id, numele), teacher_row:teacheri!evaluari_teacher_fkey(id, nume, prenume)',
      { count: 'exact' },
    )
    .order('data_evaluarii', { ascending: false })
    .order('created', { ascending: false })
    .range(from, to)

  if (cursId) query = query.eq('cursul', cursId)
  if (teacherId) query = query.eq('teacher', teacherId)
  // sezon_id e derivat de trigger din cursuri.sezon (migrația 20260717110000).
  if (sezonId) query = query.eq('sezon_id', sezonId)

  const { data, error, count } = await query
  if (error) throw error

  let rows = (data ?? []) as unknown as EvaluareWithRefs[]
  if (search.trim()) {
    rows = rows.filter((r) => {
      const label = [r.client_row?.nume, r.client_row?.prenume]
        .filter(Boolean)
        .join(' ')
      return matchesWords(label, search)
    })
  }

  return { rows, total: count ?? rows.length }
}

export async function getEvaluare(id: string): Promise<Evaluare> {
  const { data, error } = await supabase
    .from('evaluari')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createEvaluare(
  dto: InsertDto<'evaluari'>,
): Promise<Evaluare> {
  const { data, error } = await supabase
    .from('evaluari')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateEvaluare(
  id: string,
  dto: UpdateDto<'evaluari'>,
): Promise<Evaluare> {
  const { data, error } = await supabase
    .from('evaluari')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteEvaluare(id: string): Promise<void> {
  const { error } = await supabase.from('evaluari').delete().eq('id', id)
  if (error) throw error
}

// Aflăm teacher.id corespunzător utilizatorului logat (rol 'teacher').
// Returnează null pentru admin/recepție (nu sunt teacheri).
export async function getCurrentTeacherId(): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('teacheri')
    .select('id')
    .eq('auth_user_id', uid)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

// Cursurile predate de un anumit instructor. Cu `sezonId`, doar cele din acel
// sezon — altfel lista acumulează clonele din toate sezoanele (reînscrieri).
export async function cursuriByTeacher(
  teacherId: string,
  sezonId?: string | null,
): Promise<SelectOption[]> {
  let query = supabase
    .from('cursuri')
    .select('id, numele')
    .eq('teacher', teacherId)
    .order('numele', { ascending: true })
  if (sezonId) query = query.eq('sezon', sezonId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((c) => ({ value: c.id, label: c.numele }))
}

// Cursanții (clienti) înrolați la un curs, în luna curentă. Apartenența =
// înrolare NEreziliată care acoperă luna; NU folosim `activ` (nesigur pe datele
// migrate din v1 — vezi dashboard/api/grupa.ts).
export async function clientiByCurs(cursId: string): Promise<SelectOption[]> {
  const monthStart = new Date().toISOString().slice(0, 7) + '-01'
  const monthEnd = endOfMonth(monthStart)
  const { data, error } = await supabase
    .from('enrollments')
    .select('client(id, nume, prenume)')
    .eq('cursul', cursId)
    .eq('reziliat', false)
    .lte('data_incepere', monthEnd)
    .or(`data_final.is.null,data_final.gte.${monthStart}`)
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    client: { id: string; nume: string; prenume: string | null } | null
  }>

  // Cursuri facultative: clienții cu rezervare OPEN pe o ședință din luna curentă
  // au acces (ex. ședințe bonus din promo: înrolarea lor e pe altă lună) și trebuie
  // să poată fi evaluați. Oglindește fetchOpenReservationClientsThisMonth din cursuri.
  const { data: sesiuni, error: sErr } = await supabase
    .from('open_sesiuni')
    .select('id')
    .eq('curs', cursId)
    .gte('data', monthStart)
    .lte('data', monthEnd)
  if (sErr) throw sErr
  const sesiuneIds = (sesiuni ?? []).map((s) => s.id)
  if (sesiuneIds.length > 0) {
    const { data: rez, error: rErr } = await supabase
      .from('open_rezervari')
      .select('client:clienti(id, nume, prenume)')
      .in('sesiune', sesiuneIds)
      .neq('status', 'anulat')
    if (rErr) throw rErr
    for (const r of (rez ?? []) as unknown as Array<{
      client: { id: string; nume: string; prenume: string | null } | null
    }>) {
      rows.push({ client: r.client })
    }
  }

  // Dedup per client: un client poate avea mai multe rânduri care acoperă luna.
  const seen = new Set<string>()
  return rows
    .filter((r) => {
      if (!r.client || seen.has(r.client.id)) return false
      seen.add(r.client.id)
      return true
    })
    .map((r) => ({
      value: r.client!.id,
      label: `${r.client!.nume} ${r.client!.prenume ?? ''}`.trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
