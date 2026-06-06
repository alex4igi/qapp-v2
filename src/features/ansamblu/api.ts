import { supabase } from '@/lib/supabase'

export type ClientiActiviRow = {
  locatie_id: string | null
  locatie_nume: string
  activi: number
}

// Headcount clienți activi (status='Activ', pe prezență).
// Rândul cu locatie_id=null = total unic pe club; celelalte = per locație.
export async function getClientiActivi(): Promise<ClientiActiviRow[]> {
  const { data, error } = await supabase.rpc('get_clienti_activi')
  if (error) throw error
  return (data ?? []) as ClientiActiviRow[]
}

export type OcupareRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string | null
  teacher_nume: string | null
  facultativ: boolean
  activi: number
  // Doar facultativ: media prezenților/ședință în luna curentă (informativă).
  media: number | null
  capacitate: number | null
  procent: number | null
}

export async function getGradOcupare(
  locatieId: string | null,
): Promise<OcupareRow[]> {
  const { data, error } = await supabase.rpc('get_grad_ocupare', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as OcupareRow[]
}

export type ConversieLeadsRow = {
  total_leads: number
  convertiti: number
  procent: number
  zile_medii: number | null
}

export async function getConversieLeads(luni = 12): Promise<ConversieLeadsRow> {
  const { data, error } = await supabase.rpc('get_conversie_leads', {
    p_luni: luni,
  })
  if (error) throw error
  const row = (data ?? [])[0]
  return (row ?? {
    total_leads: 0,
    convertiti: 0,
    procent: 0,
    zile_medii: null,
  }) as ConversieLeadsRow
}

export type ProfitabilitateTeacherRow = {
  teacher_id: string
  teacher_nume: string
  incasari: number
  salariu: number
  marja: number
}

// Doar owner+admin (RPC are guard is_admin()).
export async function getProfitabilitateTeacher(
  luni = 12,
): Promise<ProfitabilitateTeacherRow[]> {
  const { data, error } = await supabase.rpc('get_profitabilitate_teacher', {
    p_luni: luni,
  })
  if (error) throw error
  return (data ?? []) as ProfitabilitateTeacherRow[]
}

export type CrestereNetaRow = {
  luna: string
  intrati: number
  pierduti: number
  net: number
  activi: number
}

// Flux membri lună-la-lună (intrați vs pierduți), derivat din înrolări.
export async function getCrestereNeta(
  locatieId: string | null,
  luni = 12,
): Promise<CrestereNetaRow[]> {
  const { data, error } = await supabase.rpc('get_crestere_neta', {
    p_locatie: locatieId ?? undefined,
    p_luni: luni,
  })
  if (error) throw error
  return (data ?? []) as CrestereNetaRow[]
}

export type SaptamanaPunct = {
  saptamana: string
  prezenti: number
  roster: number
  rata: number
}

export type TrendPrezenteRow = {
  curs_id: string
  curs_nume: string
  teacher_nume: string | null
  locatie_nume: string | null
  saptamani: SaptamanaPunct[]
  rata_recenta: number | null
  rata_precedenta: number | null
  in_scadere: boolean
}

// Trend prezențe per curs (ferestre 3 săpt., fără vacanțe). Teacher-ul vede doar
// cursurile lui (RPC se auto-restrânge). Privileged filtrează pe locație.
export async function getTrendPrezente(
  locatieId: string | null,
  teacherId: string | null = null,
): Promise<TrendPrezenteRow[]> {
  const { data, error } = await supabase.rpc('get_trend_prezente', {
    p_locatie: locatieId ?? undefined,
    p_teacher: teacherId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as unknown as TrendPrezenteRow[]
}
