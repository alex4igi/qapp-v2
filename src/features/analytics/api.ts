import { supabase } from '@/lib/supabase'
import type { Interval } from '@/features/statistici/api'

// Helper local: interval { fromLuna, toLuna } → date range ISO (prima/ultima zi).
function intervalToDateRange(i: Interval): { from: string; to: string } {
  const bounds = (luna: string, end: boolean) => {
    const [y, m] = luna.split('-').map(Number)
    const d = end ? new Date(Date.UTC(y, m, 0)) : new Date(Date.UTC(y, m - 1, 1))
    return d.toISOString().slice(0, 10)
  }
  const f = i.fromLuna <= i.toLuna ? i.fromLuna : i.toLuna
  const t = i.fromLuna <= i.toLuna ? i.toLuna : i.fromLuna
  return { from: bounds(f, false), to: bounds(t, true) }
}

// ── Primul ecran: ce se schimbă față de aceeași dată de anul trecut ──────────
// Motivele pentru care un indicator nu se compară vin din testele din SQL
// (`_analytics_indicatori`); aici doar le dăm formă.
export type MotivNecomparabil =
  | 'fara_sezon_ref'
  | 'luna_ref_incompleta'
  | 'luna_curenta_incompleta'
  | 'fara_capacitate_ref'
  | 'fereastra_viitoare'
  | 'calendar_plata'

export type Praguri = { acoperire: number; fara_prezenta_pp: number; plata_in_luna_pp: number }

export type IndicatoriSezon = {
  azi: string
  referinta: string
  praguri: Praguri
  cursanti: {
    valoare: number
    cu_rate_scadente: number | null
    referinta: number
    comparabil: boolean
    motiv: MotivNecomparabil | null
    nota: 'locuri_fara_prezenta' | null
    acoperire: number | null
    acoperire_ref: number | null
    fara_prezenta: number | null
    fara_prezenta_pct: number | null
    fara_prezenta_pct_ref: number | null
  }
  ocupare: {
    ocupate: number
    capacitate: number
    ocupate_ref: number
    capacitate_ref: number
    comparabil: boolean
    motiv: MotivNecomparabil | null
    nota: 'locuri_fara_prezenta' | null
    grupe_fara_capacitate_ref: number
  }
  incasari: {
    de_la: string
    valoare: number
    abonamente: number
    ref_de_la: string | null
    referinta: number | null
    comparabil: boolean
    motiv: MotivNecomparabil | null
    prima_luna_comparabila: string | null
    plata_in_luna: number | null
    plata_in_luna_ref: number | null
  }
  restante: {
    suma: number
    rate: number
    clienti: number
    oneoff: number
    rest_luna: number
    de_incasat_luna: number
  } | null
}

export type IndicatoriLocatie = IndicatoriSezon & { locatie_id: string; locatie_nume: string }

export type AnalyticsSezon = {
  selectie: IndicatoriSezon
  locatii: IndicatoriLocatie[] | null
}

export async function getAnalyticsSezon(locatieId: string | null): Promise<AnalyticsSezon> {
  const { data, error } = await supabase.rpc('get_analytics_sezon', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return data as unknown as AnalyticsSezon
}

export type CursantiLunaRow = {
  sezon_id: string
  sezon_nume: string
  luna: string
  cursanti: number
  acoperire: number | null
  incomplet: boolean
  in_curs: boolean
}

export async function getCursantiLunar(locatieId: string | null): Promise<CursantiLunaRow[]> {
  const { data, error } = await supabase.rpc('get_cursanti_lunar', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return ((data ?? []) as CursantiLunaRow[]).map((r) => ({
    ...r,
    cursanti: Number(r.cursanti ?? 0),
    acoperire: r.acoperire != null ? Number(r.acoperire) : null,
  }))
}

// ── Leads pe lună ────────────────────────────────────────────────────────────
export type LeadsLunaRow = { luna: string; leads: number; convertiti: number }

export async function getLeadsPeLuna(i: Interval, locatieLabel: string | null): Promise<LeadsLunaRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_leads_pe_luna', {
    p_from: from,
    p_to: to,
    ...(locatieLabel ? { p_locatie: locatieLabel } : {}),
  })
  if (error) throw error
  return ((data ?? []) as LeadsLunaRow[]).map((r) => ({
    luna: r.luna,
    leads: Number(r.leads ?? 0),
    convertiti: Number(r.convertiti ?? 0),
  }))
}

// ── Ocupare prime-time ───────────────────────────────────────────────────────
export type PrimeTimeRow = {
  slot: string
  grupe: number
  activi: number
  capacitate: number
  procent: number | null
}

export async function getOcuparePrimeTime(locatieId: string | null): Promise<PrimeTimeRow[]> {
  const { data, error } = await supabase.rpc('get_ocupare_prime_time', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return ((data ?? []) as PrimeTimeRow[]).map((r) => ({
    slot: r.slot,
    grupe: Number(r.grupe ?? 0),
    activi: Number(r.activi ?? 0),
    capacitate: Number(r.capacitate ?? 0),
    procent: r.procent != null ? Number(r.procent) : null,
  }))
}

// ── Mix recurent vs one-off ──────────────────────────────────────────────────
export type RecurentOneoffRow = { tip: string; total: number }

export async function getMixRecurentOneoff(
  i: Interval,
  locatieId: string | null = null,
): Promise<RecurentOneoffRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mix_recurent_oneoff', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as RecurentOneoffRow[]).map((r) => ({
    tip: r.tip,
    total: Number(r.total ?? 0),
  }))
}

// ── Instructori — clienți + trend (feature „1 click") ───────────────────────
export type InstructorTrendRow = {
  teacher_id: string
  teacher_nume: string
  clienti_curent: number
  clienti_prev: number
  delta: number
  retentie_procent: number | null
  serie: number[]
}

export async function getInstructoriClientiTrend(luni = 6): Promise<InstructorTrendRow[]> {
  const { data, error } = await supabase.rpc('get_instructori_clienti_trend', { p_luni: luni })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    teacher_id: String(r.teacher_id),
    teacher_nume: (r.teacher_nume as string) ?? '',
    clienti_curent: Number(r.clienti_curent ?? 0),
    clienti_prev: Number(r.clienti_prev ?? 0),
    delta: Number(r.delta ?? 0),
    retentie_procent: r.retentie_procent != null ? Number(r.retentie_procent) : null,
    serie: ((r.serie as number[]) ?? []).map((x) => Number(x)),
  }))
}
