import { supabase } from '@/lib/supabase'
import { getProgresTeacher } from '@/features/metodologic/api'

// Hub „Grupele mele — progres" (rol teacher). Compune RPC-uri existente
// teacher-scoped (get_grad_ocupare, get_trend_prezente) cu cele noi
// (get_absente_risc_teacher, get_reinscriere_teacher, get_participare_teacher,
// get_evaluari_stats_teacher).

export type AbsentaRisc = {
  client_id: string
  client_nume: string
  curs_id: string
  curs_nume: string
  // Ședințe ținute de grupă de la ultimul semnal al cursantului — vezi
  // AbsentaRow (analytics/api.ts) pentru de ce nu numărăm absențe bifate.
  sedinte_ratate: number
  lectii_pe_saptamana: number
  zile_tacere: number
  ultima_prezenta: string | null
  // Vezi AbsentaRow (analytics/api.ts) — unde vine cursantul acum, dacă vine.
  vine_la: string | null
}

// Pragul e în SĂPTĂMÂNI de tăcere — același ca în RPC-ul get_absente_consecutive.
export async function getAbsenteRisc(saptamani = 2): Promise<AbsentaRisc[]> {
  const { data, error } = await supabase.rpc('get_absente_risc_teacher', {
    p_saptamani: saptamani,
  })
  if (error) throw error
  return (data as AbsentaRisc[]) ?? []
}

export type GradOcupare = {
  curs_id: string
  curs_nume: string
  facultativ: boolean
  activi: number
  capacitate: number | null
  procent: number | null
}

export async function getGradOcupare(): Promise<GradOcupare[]> {
  const { data, error } = await supabase.rpc('get_grad_ocupare', {
    p_locatie: undefined,
  })
  if (error) throw error
  return (data as GradOcupare[]) ?? []
}

export type SaptamanaPrezenta = {
  saptamana: string
  prezenti: number
  roster: number
  rata: number
}

export type TrendPrezenta = {
  curs_id: string
  rata_recenta: number | null
  rata_precedenta: number | null
  in_scadere: boolean
  saptamani: SaptamanaPrezenta[] | null
}

export async function getTrendPrezente(): Promise<TrendPrezenta[]> {
  const { data, error } = await supabase.rpc('get_trend_prezente', {
    p_locatie: undefined,
    p_teacher: undefined,
    p_saptamani: 9,
  })
  if (error) throw error
  return (data as TrendPrezenta[]) ?? []
}

export type Reinscriere = {
  curs_id: string
  curs_nume: string
  total_eligibili: number
  activati: number
  procent: number
}

export async function getReinscriere(): Promise<Reinscriere[]> {
  const { data, error } = await supabase.rpc('get_reinscriere_teacher', {})
  if (error) throw error
  return (data as Reinscriere[]) ?? []
}

export type Participare = {
  curs_id: string
  curs_nume: string
  concurs: number
  spectacol: number
}

export async function getParticipare(): Promise<Participare[]> {
  const { data, error } = await supabase.rpc('get_participare_teacher')
  if (error) throw error
  return (data as Participare[]) ?? []
}

export type SkillsAvg = Record<string, number | null>
export type EvaluareTrendPunct = { data: string; media: number; n: number }

export type EvaluariStats = {
  curs_id: string
  curs_nume: string
  n_evaluari: number
  n_cursanti: number
  media_generala: number | null
  skills: SkillsAvg | null
  trend: EvaluareTrendPunct[]
}

export async function getEvaluariStats(): Promise<EvaluariStats[]> {
  const { data, error } = await supabase.rpc('get_evaluari_stats_teacher')
  if (error) throw error
  return (data as EvaluariStats[]) ?? []
}

export type ZiNastere = {
  client_id: string
  client_nume: string
  curs_nume: string
  zi: number
  este_azi: boolean
}

export async function getZileNastere(): Promise<ZiNastere[]> {
  const { data, error } = await supabase.rpc('get_zile_nastere_teacher')
  if (error) throw error
  const rows = (data as ZiNastere[]) ?? []
  return rows.sort((a, b) => a.zi - b.zi)
}

// ── Model compus per grupă pentru tabelul principal ─────────────────────────
export type GrupaProgres = {
  cursId: string
  nume: string
  facultativ: boolean
  activi: number
  capacitate: number | null
  ocupare: number | null
  rataPrezenta: number | null
  prezentaInScadere: boolean
  trendSaptamani: number[]
  reinscriereProcent: number | null
  reinscriereEligibili: number
  concurs: number
  spectacol: number
  // Progres pe programul metodologic (null dacă grupa n-are program asociat).
  planSedintaCurenta: number | null
  planTotal: number | null
  planModulTema: string | null
}

export type HubData = {
  grupe: GrupaProgres[]
  absenteRisc: AbsentaRisc[]
  evaluari: EvaluariStats[]
  zileNastere: ZiNastere[]
}

export async function getHubData(): Promise<HubData> {
  const [
    ocupare,
    trend,
    reinscriere,
    participare,
    absenteRisc,
    evaluari,
    zileNastere,
    planProgres,
  ] = await Promise.all([
    getGradOcupare(),
    getTrendPrezente(),
    getReinscriere(),
    getParticipare(),
    getAbsenteRisc(2),
    getEvaluariStats(),
    getZileNastere(),
    getProgresTeacher(),
  ])

  const trendById = new Map(trend.map((t) => [t.curs_id, t]))
  const reinById = new Map(reinscriere.map((r) => [r.curs_id, r]))
  const partById = new Map(participare.map((p) => [p.curs_id, p]))
  const planById = new Map(planProgres.map((p) => [p.curs_id, p]))

  // Master = cursurile sezonului activ (get_grad_ocupare). Restul se lipesc.
  const grupe: GrupaProgres[] = ocupare.map((o) => {
    const t = trendById.get(o.curs_id)
    const r = reinById.get(o.curs_id)
    const p = partById.get(o.curs_id)
    const plan = planById.get(o.curs_id)
    return {
      cursId: o.curs_id,
      nume: o.curs_nume,
      facultativ: o.facultativ,
      activi: o.activi,
      capacitate: o.capacitate,
      ocupare: o.procent,
      rataPrezenta: t?.rata_recenta ?? null,
      prezentaInScadere: t?.in_scadere ?? false,
      trendSaptamani: (t?.saptamani ?? []).map((s) => s.rata),
      reinscriereProcent: r?.procent ?? null,
      reinscriereEligibili: r?.total_eligibili ?? 0,
      concurs: p?.concurs ?? 0,
      spectacol: p?.spectacol ?? 0,
      planSedintaCurenta: plan?.nr_sedinta_curenta ?? null,
      planTotal: plan?.total_sedinte ?? null,
      planModulTema: plan?.modul_tema ?? null,
    }
  })

  return { grupe, absenteRisc, evaluari, zileNastere }
}
