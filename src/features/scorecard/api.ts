import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/db'
import type { Clasa } from './constants'

export type ScorecardRow = {
  user_id: string
  contacte_total: number
  contacte_verificate: number
  contacte_telefon: number
  contacte_sms: number
  contacte_email: number
  contacte_dm: number
  leaduri_lucrate: number
  viteza_med_ore: number | null
  viteza_clasa: Clasa
  persistenta_med: number | null
  persistenta_clasa: Clasa
  followup_onorat_pct: number | null
  igiena_crm_pct: number | null
  igiena_clasa: Clasa
  conversie_pct: number | null
  conversie_clasa: Clasa
  show_rate_pct: number | null
  show_rate_clasa: Clasa
  volum_clasa: Clasa
  nota_lipsa_pct: number | null
  rafala_flag: boolean
  decalaj_flag: boolean
  scor_total: number | null
  scor_pct: number | null
  clasa_generala: Clasa
}

export type ScorecardRestanteRow = {
  user_id: string
  contacte_recuperare: number
  clienti_contactati: number
  suma_recuperata: number
  rest_ramas: number
  rata_recuperare_pct: number | null
  rata_clasa: Clasa
  igiena_pct: number | null
  igiena_clasa: Clasa
  volum_clasa: Clasa
  rafala_flag: boolean
  decalaj_flag: boolean
  scor_total: number | null
  scor_pct: number | null
  clasa_generala: Clasa
}

export type ScorecardReactivariRow = {
  user_id: string
  contacte_reactivare: number
  clienti_contactati: number
  reactivati: number
  rata_reactivare_pct: number | null
  rata_clasa: Clasa
  igiena_pct: number | null
  igiena_clasa: Clasa
  volum_clasa: Clasa
  rafala_flag: boolean
  decalaj_flag: boolean
  scor_total: number | null
  scor_pct: number | null
  clasa_generala: Clasa
}

export type Prag = Tables<'scorecard_praguri'>

// Lună 'YYYY-MM' → marginile zilei (prima/ultima zi a lunii, ISO).
export function lunaToBounds(luna: string): { from: string; to: string } {
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

export async function getScorecard(
  luna: string,
  locatie: string | null,
): Promise<ScorecardRow[]> {
  const { from, to } = lunaToBounds(luna)
  const { data, error } = await supabase.rpc('get_scorecard_operatori', {
    p_from: from,
    p_to: to,
    ...(locatie ? { p_locatie: locatie } : {}),
  })
  if (error) throw error
  return (data ?? []) as unknown as ScorecardRow[]
}

export async function getScorecardRestante(
  luna: string,
  locatieId: string | null,
): Promise<ScorecardRestanteRow[]> {
  const { from, to } = lunaToBounds(luna)
  const { data, error } = await supabase.rpc('get_scorecard_restante', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return (data ?? []) as unknown as ScorecardRestanteRow[]
}

export async function getScorecardReactivari(
  luna: string,
  locatieId: string | null,
): Promise<ScorecardReactivariRow[]> {
  const { from, to } = lunaToBounds(luna)
  const { data, error } = await supabase.rpc('get_scorecard_reactivari', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return (data ?? []) as unknown as ScorecardReactivariRow[]
}

export type RataRestante = {
  rest: number
  de_incasat: number
  rata_pct: number | null
}

// Rată restanțe de portofoliu (echipă/locație) pe o lună: rest ÷ de-încasat.
// Sursa e RPC-ul `get_rata_restante` — ACEEAȘI bază ca pe /datorii: definiția
// canonică (fără prescrise, rezilieri, luni viitoare) PLUS datoriile one-off
// (bilete/taxe/merch), care lipseau când se citea direct restante_locatie_luna.
// E cifra pe care se dau bonusurile lunare, deci nu are voie să difere de ecran.
export async function getRataRestante(
  luna: string,
  locatieId: string | null,
): Promise<RataRestante> {
  const { data, error } = await supabase.rpc('get_rata_restante', {
    p_luna: `${luna}-01`,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  let de = 0
  let rest = 0
  for (const r of (data ?? []) as unknown as { de_incasat: number; rest: number }[]) {
    de += Number(r.de_incasat ?? 0)
    rest += Number(r.rest ?? 0)
  }
  return {
    rest,
    de_incasat: de,
    rata_pct: de > 0 ? Math.round((rest / de) * 1000) / 10 : null,
  }
}

export async function listPraguri(): Promise<Prag[]> {
  const { data, error } = await supabase
    .from('scorecard_praguri')
    .select('*')
    .order('faza', { ascending: true })
    .order('cheie', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function updatePrag(
  cheie: string,
  patch: { prag_standard: number; prag_peste: number; pondere: number },
): Promise<void> {
  const { error } = await supabase
    .from('scorecard_praguri')
    .update({ ...patch, updated: new Date().toISOString() })
    .eq('cheie', cheie)
  if (error) throw error
}

// ── Obiective lunare de echipă (quota) ──────────────────────────────────
export type ObiectivMetric = 'conversii' | 'contacte_verificate'

export async function listObiective(
  luna: string,
): Promise<Record<ObiectivMetric, number | null>> {
  const { data, error } = await supabase
    .from('scorecard_obiective')
    .select('metric, target')
    .eq('luna', luna)
  if (error) throw error
  const out: Record<ObiectivMetric, number | null> = {
    conversii: null,
    contacte_verificate: null,
  }
  for (const r of data ?? []) {
    out[r.metric as ObiectivMetric] = Number(r.target)
  }
  return out
}

export async function upsertObiectiv(
  luna: string,
  metric: ObiectivMetric,
  target: number,
): Promise<void> {
  const { error } = await supabase
    .from('scorecard_obiective')
    .upsert(
      { luna, metric, target, updated: new Date().toISOString() },
      { onConflict: 'luna,metric' },
    )
  if (error) throw error
}

// Conversii reale ale lunii (count pe leads.data_conversie), filtrabile pe
// locație. Sursa de adevăr pentru „realizat" la obiectivul de conversii —
// independent de atribuirea per operator din scorecard.
export async function getConversiiCount(
  luna: string,
  locatie: string | null,
): Promise<number> {
  const { from, to } = lunaToBounds(luna)
  let q = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('data_conversie', from)
    .lte('data_conversie', `${to}T23:59:59.999`)
  if (locatie) q = q.eq('locatia', locatie)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
