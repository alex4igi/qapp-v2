// Funcții pentru popularea dropdown-urilor cu relații (teacheri, săli, sezoane, cursuri).
import { supabase } from '@/lib/supabase'
import type { SelectOption } from '@/components/ui'

export async function teacheriOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('teacheri')
    .select('id, nume, prenume')
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []).map((t) => ({
    value: t.id,
    label: `${t.nume} ${t.prenume ?? ''}`.trim(),
  }))
}

export async function saliOptions(
  locatieId?: string | null,
): Promise<SelectOption[]> {
  let q = supabase.from('sali').select('id, nume').order('nume', { ascending: true })
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((s) => ({ value: s.id, label: s.nume }))
}

export type SalaRow = { id: string; nume: string; locatie: string | null }

export async function saliWithLocatie(): Promise<SalaRow[]> {
  const { data, error } = await supabase
    .from('sali')
    .select('id, nume, locatie')
    .order('nume', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function locatiiOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('locatii')
    .select('id, nume')
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []).map((l) => ({ value: l.id, label: l.nume }))
}

export async function sezoaneOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului')
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []).map((s) => ({
    value: s.id,
    label: s.numele_sezonului,
  }))
}

// Id-ul sezonului activ (stare='activ', unic). null dacă nu există unul activ.
export async function sezonActivId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id')
    .eq('stare', 'activ')
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

// Sezonul activ cu datele de start/sfârșit (pt. prorata + prima lună la înrolare).
export async function sezonActiv(): Promise<
  { id: string; data_incepere: string; data_final: string } | null
> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, data_incepere, data_final')
    .eq('stare', 'activ')
    .maybeSingle()
  if (error) throw error
  if (!data?.data_incepere || !data?.data_final) return null
  return {
    id: data.id,
    data_incepere: data.data_incepere,
    data_final: data.data_final,
  }
}

export async function cursuriOptions(
  locatieId?: string | null,
  sezonId?: string | null,
): Promise<SelectOption[]> {
  if (locatieId) {
    // Filtru pe locație via cursuri → sali.locatie (relația nu permite .eq direct)
    let q = supabase
      .from('cursuri')
      .select('id, numele, sala_rel:sali!fk_cursuri_sala(locatie)')
      .order('numele', { ascending: true })
    if (sezonId) q = q.eq('sezon', sezonId)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as unknown as Array<{
      id: string
      numele: string
      sala_rel: { locatie: string | null } | null
    }>
    return rows
      .filter((r) => r.sala_rel?.locatie === locatieId)
      .map((c) => ({ value: c.id, label: c.numele }))
  }
  let q = supabase
    .from('cursuri')
    .select('id, numele')
    .order('numele', { ascending: true })
  if (sezonId) q = q.eq('sezon', sezonId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((c) => ({ value: c.id, label: c.numele }))
}

// Listă cursuri asociate teacher-ului curent (via cursuri_teacheri M:N).
// Folosit în UI pentru teacher (PrezentePage, CursuriListPage când role=teacher).
export async function cursuriOptionsForCurrentTeacher(): Promise<SelectOption[]> {
  // Identifică teacher_id-ul curent
  const { data: tIds } = await supabase.rpc('current_teacher_id')
  const teacherId = (tIds as unknown as string | null) ?? null
  if (!teacherId) return []
  const { data, error } = await supabase
    .from('cursuri_teacheri')
    .select('curs_id, cursuri:cursuri!cursuri_teacheri_curs_id_fkey(id, numele)')
    .eq('teacher_id', teacherId)
  if (error) throw error
  type Row = { cursuri: { id: string; numele: string } | null }
  const rows = (data as unknown as Row[]) ?? []
  const seen = new Set<string>()
  const out: SelectOption[] = []
  for (const r of rows) {
    if (r.cursuri && !seen.has(r.cursuri.id)) {
      seen.add(r.cursuri.id)
      out.push({ value: r.cursuri.id, label: r.cursuri.numele })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export async function clientiOptions(): Promise<SelectOption[]> {
  type Row = {
    id: string
    nume: string
    prenume: string | null
    telefon: string | null
    data_nasterii: string | null
    familia_rel: { nume_familie: string | null } | null
  }
  // PostgREST taie tăcut la 1000 rânduri; cu 6000+ clienți paginăm ca să-i aducem pe toți.
  const PAGE = 1000
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('clienti')
      .select(
        'id, nume, prenume, telefon, data_nasterii, familia_rel:familii!fk_clienti_familia(nume_familie)',
      )
      .order('nume', { ascending: true })
      .order('prenume', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data as unknown as Row[]) ?? []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows.map((c) => {
    const parts: string[] = []
    if (c.telefon) parts.push(c.telefon)
    const age = calcAge(c.data_nasterii)
    if (age != null) parts.push(`${age} ani`)
    const fam = c.familia_rel?.nume_familie
    if (fam) parts.push(`Familia ${fam}`)
    return {
      value: c.id,
      label: `${c.nume} ${c.prenume ?? ''}`.trim(),
      secondary: parts.join(' · ') || undefined,
    }
  })
}

function calcAge(dataNasterii: string | null): number | null {
  if (!dataNasterii) return null
  const [y, m, d] = dataNasterii.split('-').map(Number)
  const birth = new Date(y, m - 1, d)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const mo = today.getMonth() - birth.getMonth()
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export async function familiiOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('familii')
    .select(
      'id, nume_familie, nume_reprezentant, prenume_reprezentant, telefon, membri:clienti!fk_clienti_familia(count)',
    )
    .order('nume_familie', { ascending: true })
  if (error) throw error
  type Row = {
    id: string
    nume_familie: string
    nume_reprezentant: string | null
    prenume_reprezentant: string | null
    telefon: string | null
    membri: { count: number }[] | null
  }
  return (data as unknown as Row[]).map((f) => {
    const repName = [f.nume_reprezentant, f.prenume_reprezentant]
      .filter(Boolean)
      .join(' ')
    const count = f.membri?.[0]?.count ?? 0
    const parts: string[] = []
    if (repName) parts.push(repName)
    else if (f.telefon) parts.push(f.telefon)
    parts.push(
      count === 0 ? 'fără membri' : count === 1 ? '1 membru' : `${count} membri`,
    )
    return {
      value: f.id,
      label: f.nume_familie,
      secondary: parts.join(' · '),
    }
  })
}

export async function voucheriOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('vouchere')
    .select('id, cod_voucher')
    .order('cod_voucher', { ascending: true })
  if (error) throw error
  return (data ?? []).map((v) => ({ value: v.id, label: v.cod_voucher }))
}

export async function campaniiOptions(): Promise<SelectOption[]> {
  const { data, error } = await supabase
    .from('campanii_promovare')
    .select('id, nume')
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c) => ({ value: c.id, label: c.nume }))
}
