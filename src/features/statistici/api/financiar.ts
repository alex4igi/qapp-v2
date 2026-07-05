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

