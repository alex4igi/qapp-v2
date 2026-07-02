import { supabase } from '@/lib/supabase'
import type { Interval } from '@/features/statistici/api'

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

// ── MRR trend (venit recurent lunar), split recurent/facultativ ──────────────
export type MrrRow = {
  luna: string
  mrr_recurent: number
  mrr_facultativ: number
  enrolari_recurent: number
  enrolari_facultativ: number
}

export async function getMrrTrend(i: Interval, locatieId: string | null = null): Promise<MrrRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mrr_trend', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as MrrRow[]).map((r) => ({
    luna: r.luna,
    mrr_recurent: Number(r.mrr_recurent ?? 0),
    mrr_facultativ: Number(r.mrr_facultativ ?? 0),
    enrolari_recurent: Number(r.enrolari_recurent ?? 0),
    enrolari_facultativ: Number(r.enrolari_facultativ ?? 0),
  }))
}

// ── Rata de încasare + DSO (cohortă facturată în interval) ───────────────────
export type ColectareDso = {
  facturat: number
  incasat: number
  rata_colectare: number | null
  restante_net: number
  dso_zile: number | null
}

export async function getColectareDso(i: Interval, locatieId: string | null = null): Promise<ColectareDso> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_colectare_dso', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  const row = (data ?? [])[0]
  return {
    facturat: Number(row?.facturat ?? 0),
    incasat: Number(row?.incasat ?? 0),
    rata_colectare: row?.rata_colectare != null ? Number(row.rata_colectare) : null,
    restante_net: Number(row?.restante_net ?? 0),
    dso_zile: row?.dso_zile != null ? Number(row.dso_zile) : null,
  }
}
