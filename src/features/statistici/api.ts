import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

export type Kpis = {
  incasari: number
  cheltuieli: number
  profit: number
  restanteTotal: number
}

export type LunaBalanta = {
  luna: string
  incasat: number
  datorie: number
}

export type MetodaPunct = {
  metoda: Enums<'metoda_plata'> | 'Necunoscut'
  total: number
}

export type Interval = {
  fromLuna: string
  toLuna: string
}

function lunaToBounds(luna: string): { from: string; to: string } {
  const [y, m] = luna.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

export function lunaCurenta(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function lunaCuOffset(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getSezonActiv(): Promise<Interval | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('data_incepere, data_final')
    .eq('activ', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.data_incepere || !data?.data_final) return null
  return {
    fromLuna: data.data_incepere.slice(0, 7),
    toLuna: data.data_final.slice(0, 7),
  }
}

export function lunileInInterval(fromLuna: string, toLuna: string): string[] {
  if (fromLuna > toLuna) return []
  const out: string[] = []
  const [fy, fm] = fromLuna.split('-').map(Number)
  const [ty, tm] = toLuna.split('-').map(Number)
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function intervalToDateRange(i: Interval): { from: string; to: string } {
  return {
    from: lunaToBounds(i.fromLuna).from,
    to: lunaToBounds(i.toLuna).to,
  }
}

export async function getKpis(i: Interval): Promise<Kpis> {
  const { from, to } = intervalToDateRange(i)

  const [incRes, chelRes, restRes] = await Promise.all([
    supabase.from('incasari').select('suma').gte('data', from).lte('data', to),
    supabase
      .from('cheltuieli')
      .select('valoare')
      .gte('deadline', from)
      .lte('deadline', to),
    supabase.from('plati_inrolari').select('rest').gt('rest', 0),
  ])

  if (incRes.error) throw incRes.error
  if (chelRes.error) throw chelRes.error
  if (restRes.error) throw restRes.error

  const incasari = (incRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.suma ?? 0),
    0,
  )
  const cheltuieli = (chelRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.valoare ?? 0),
    0,
  )
  const restanteTotal = (restRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.rest ?? 0),
    0,
  )

  return {
    incasari,
    cheltuieli,
    profit: incasari - cheltuieli,
    restanteTotal,
  }
}

async function fetchBalanta(
  i: Interval,
  filterColumn: 'locatie' | 'curs' | null,
  filterValue: string | null,
): Promise<LunaBalanta[]> {
  let qDe = supabase
    .from('de_incasat_pe_luna')
    .select('luna, de_incasat, locatie, curs')
    .gte('luna', i.fromLuna)
    .lte('luna', i.toLuna)
  let qInc = supabase
    .from('incasat_pe_luna')
    .select('luna, incasat, locatie, curs')
    .gte('luna', i.fromLuna)
    .lte('luna', i.toLuna)

  if (filterColumn && filterValue) {
    qDe = qDe.eq(filterColumn, filterValue)
    qInc = qInc.eq(filterColumn, filterValue)
  }

  const [deRes, incRes] = await Promise.all([qDe, qInc])
  if (deRes.error) throw deRes.error
  if (incRes.error) throw incRes.error

  const byLuna = new Map<string, { de_incasat: number; incasat: number }>()
  for (const row of deRes.data ?? []) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    cur.de_incasat += Number(row.de_incasat ?? 0)
    byLuna.set(luna, cur)
  }
  for (const row of incRes.data ?? []) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    cur.incasat += Number(row.incasat ?? 0)
    byLuna.set(luna, cur)
  }

  const luniInterval = lunileInInterval(i.fromLuna, i.toLuna)
  return luniInterval.map((luna) => {
    const v = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    const datorie = Math.max(0, v.de_incasat - v.incasat)
    return { luna, incasat: v.incasat, datorie }
  })
}

export async function getBalantaLocatie(
  i: Interval,
  locatieId: string | null,
): Promise<LunaBalanta[]> {
  return fetchBalanta(i, locatieId ? 'locatie' : null, locatieId)
}

export async function getBalantaCurs(
  i: Interval,
  cursId: string | null,
): Promise<LunaBalanta[]> {
  return fetchBalanta(i, cursId ? 'curs' : null, cursId)
}

export type CategoriePunct = { categorie: string; total: number }

export async function getMixCategoriiIncasari(
  i: Interval,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('incasari')
    .select('suma, categorie')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.categorie ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.suma ?? 0))
  }
  return Array.from(map.entries())
    .map(([categorie, total]) => ({ categorie, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export async function getMixCategoriiCheltuieli(
  i: Interval,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('cheltuieli')
    .select('valoare, categorie')
    .gte('deadline', from)
    .lte('deadline', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.categorie ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.valoare ?? 0))
  }
  return Array.from(map.entries())
    .map(([categorie, total]) => ({ categorie, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

// ============================================================================
// KPI-uri reînscrieri & sezoane
// ============================================================================

export type SezonOption = {
  id: string
  numele_sezonului: string
  stare: string
  tip: string
}

export async function listSezoaneTinta(): Promise<SezonOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, stare, tip')
    .eq('tip', 'principal')
    .in('stare', ['planificat', 'activ'])
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as SezonOption[]
}

export type ReinscriereKpiRow = {
  curs_id: string
  curs_nume: string
  varsta: string | null
}

export type PierdereRow = ReinscriereKpiRow & {
  activati_curent: number
  pierduti: number
  procent_pierdere: number
}

export type ConversieRow = ReinscriereKpiRow & {
  activati: number
  platiti: number
  procent_conversie: number
}

export type IncasariSezonRow = {
  sezon_id: string
  numele_sezonului: string
  tip: string
  stare: string
  data_incepere: string | null
  data_final: string | null
  total_incasari: number
}

export async function getReinscrieriPierderi(
  sezonTintaId: string,
): Promise<PierdereRow[]> {
  const { data, error } = await supabase.rpc('get_reinscrieri_pierderi', {
    p_sezon_tinta: sezonTintaId,
  })
  if (error) throw error
  return (data ?? []) as PierdereRow[]
}

export async function getReinscrieriConversie(
  sezonTintaId: string,
): Promise<ConversieRow[]> {
  const { data, error } = await supabase.rpc('get_reinscrieri_conversie', {
    p_sezon_tinta: sezonTintaId,
  })
  if (error) throw error
  return (data ?? []) as ConversieRow[]
}

export async function getIncasariPerSezon(): Promise<IncasariSezonRow[]> {
  const { data, error } = await supabase.rpc('get_incasari_per_sezon')
  if (error) throw error
  return ((data ?? []) as IncasariSezonRow[]).map((r) => ({
    ...r,
    total_incasari: Number(r.total_incasari ?? 0),
  }))
}

export async function getMixMetode(i: Interval): Promise<MetodaPunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('incasari')
    .select('metoda, suma')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.metoda ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.suma ?? 0))
  }
  return Array.from(map.entries())
    .map(([metoda, total]) => ({
      metoda: metoda as MetodaPunct['metoda'],
      total,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}
