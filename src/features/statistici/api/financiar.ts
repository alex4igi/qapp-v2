import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { type Interval, intervalToDateRange, lunaToBounds, lunaCurenta, lunileInInterval } from './interval'

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

export async function getKpis(i: Interval, locatieId: string | null = null): Promise<Kpis> {
  const { from, to } = intervalToDateRange(i)

  // Agregare server-side (SUM în SQL) — altfel PostgREST plafonează la 1000 rânduri
  // și KPI-urile sunt subevaluate. Restanțele sunt pe interval + neprescrise.
  // Cheltuielile nu au dimensiune de locație → rămân globale chiar cu p_locatie.
  const { data, error } = await supabase.rpc('get_kpis_financiar', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error

  const row = (data ?? [])[0]
  const incasari = Number(row?.incasari ?? 0)
  const cheltuieli = Number(row?.cheltuieli ?? 0)

  return {
    incasari,
    cheltuieli,
    profit: incasari - cheltuieli,
    restanteTotal: Number(row?.restante ?? 0),
  }
}

async function fetchBalanta(
  i: Interval,
  filterColumn: 'locatie' | 'curs' | null,
  filterValue: string | null,
): Promise<LunaBalanta[]> {
  // Datoria lunară = total_restant_net din view-urile restante_*_luna (definiția
  // canonică: fără prescrise, rezilieri, luni viitoare) — nu mai derivăm
  // „de încasat − încasat" (era brut și diverge de restul aplicației).
  type Row = { luna: string | null; total_incasat: number | null; total_restant_net: number | null }
  let rows: Row[]
  if (filterColumn === 'curs') {
    let q = supabase
      .from('restante_curs_luna')
      .select('luna, total_incasat, total_restant_net')
      .gte('luna', i.fromLuna)
      .lte('luna', i.toLuna)
    if (filterValue) q = q.eq('id_curs', filterValue)
    const { data, error } = await q
    if (error) throw error
    rows = data ?? []
  } else {
    let q = supabase
      .from('restante_locatie_luna')
      .select('luna, total_incasat, total_restant_net')
      .gte('luna', i.fromLuna)
      .lte('luna', i.toLuna)
    if (filterColumn === 'locatie' && filterValue) q = q.eq('id_locatie', filterValue)
    const { data, error } = await q
    if (error) throw error
    rows = data ?? []
  }

  const byLuna = new Map<string, { incasat: number; datorie: number }>()
  for (const row of rows) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { incasat: 0, datorie: 0 }
    cur.incasat += Number(row.total_incasat ?? 0)
    cur.datorie += Number(row.total_restant_net ?? 0)
    byLuna.set(luna, cur)
  }

  const luniInterval = lunileInInterval(i.fromLuna, i.toLuna)
  return luniInterval.map((luna) => {
    const v = byLuna.get(luna) ?? { incasat: 0, datorie: 0 }
    return { luna, incasat: v.incasat, datorie: v.datorie }
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

// Balanța lunară pe teacher vine dintr-un view separat (restante_teacher_luna),
// nu din de_incasat/incasat_pe_luna (care nu au dimensiune de teacher).
export async function getBalantaTeacher(
  i: Interval,
  teacherId: string | null,
): Promise<LunaBalanta[]> {
  let q = supabase
    .from('restante_teacher_luna')
    .select('luna, id_teacher, total_incasat, total_restant_net')
    .gte('luna', i.fromLuna)
    .lte('luna', i.toLuna)
  if (teacherId) q = q.eq('id_teacher', teacherId)

  const { data, error } = await q
  if (error) throw error

  const byLuna = new Map<string, { incasat: number; datorie: number }>()
  for (const row of data ?? []) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { incasat: 0, datorie: 0 }
    cur.incasat += Number(row.total_incasat ?? 0)
    cur.datorie += Number(row.total_restant_net ?? 0)
    byLuna.set(luna, cur)
  }

  const luniInterval = lunileInInterval(i.fromLuna, i.toLuna)
  return luniInterval.map((luna) => {
    const v = byLuna.get(luna) ?? { incasat: 0, datorie: 0 }
    return { luna, incasat: v.incasat, datorie: v.datorie }
  })
}

export type CategoriePunct = { categorie: string; total: number }

export async function getMixCategoriiIncasari(
  i: Interval,
  locatieId: string | null = null,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mix_categorii_incasari', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as Array<{ categorie: string; total: number }>).map(
    (r) => ({ categorie: r.categorie, total: Number(r.total ?? 0) }),
  )
}

export async function getMixCategoriiCheltuieli(
  i: Interval,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mix_categorii_cheltuieli', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return ((data ?? []) as Array<{ categorie: string; total: number }>)
    .map((r) => ({ categorie: r.categorie, total: Number(r.total ?? 0) }))
    .sort((a, b) => b.total - a.total)
}

// Venit (încasări) pe luna curentă. Aceeași definiție canonică ca în getKpis
// (sumă pe data plății, server-side), ca să fie consistent cu /statistici.
export async function getVenitLunaCurenta(): Promise<number> {
  const { from, to } = lunaToBounds(lunaCurenta())
  const { data, error } = await supabase.rpc('get_kpis_financiar', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return Number((data ?? [])[0]?.incasari ?? 0)
}

export async function getMixMetode(
  i: Interval,
  locatieId: string | null = null,
): Promise<MetodaPunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mix_metode', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as Array<{ metoda: string; total: number }>).map((r) => ({
    metoda: r.metoda as MetodaPunct['metoda'],
    total: Number(r.total ?? 0),
  }))
}

