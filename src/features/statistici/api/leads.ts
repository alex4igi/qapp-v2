import { supabase } from '@/lib/supabase'
import { type Interval, intervalToDateRange } from './interval'

// ============================================================================
// Funnel leads — Lead → Contact → Probă → Prezent → Înscriere → Retenție 90z
// ============================================================================

export type FunnelSursaRow = {
  sursaId: string | null
  sursaNume: string
  leads: number
  contactati: number
  proba: number
  prezenti: number
  convertiti: number
  retentieEligibili: number
  retentie90z: number
}

export type LeadFunnel = {
  global: Omit<FunnelSursaRow, 'sursaId' | 'sursaNume'>
  perSursa: FunnelSursaRow[]
}

// Cohortă pe data intrării lead-ului; trepte cumulative (vezi RPC). Retenția
// 90z se raportează la baza „eligibilă" (convertiți maturi ≥90z), nu la toți.
export async function getLeadFunnel(
  i: Interval,
  locatieId: string | null,
  locatieLabel?: string | null,
): Promise<LeadFunnel> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_lead_funnel', {
    p_from: from,
    p_to: to,
    // RPC filtrează pe leads.locatia (TEXT label), nu pe uuid
    ...(locatieId && locatieLabel ? { p_locatie: locatieLabel } : {}),
  })
  if (error) throw error

  const perSursa: FunnelSursaRow[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      sursaId: (r.sursa_id as string) ?? null,
      sursaNume: (r.sursa_nume as string) ?? 'Necunoscută',
      leads: Number(r.leads_total ?? 0),
      contactati: Number(r.contactati ?? 0),
      proba: Number(r.proba ?? 0),
      prezenti: Number(r.prezenti ?? 0),
      convertiti: Number(r.convertiti ?? 0),
      retentieEligibili: Number(r.retentie_eligibili ?? 0),
      retentie90z: Number(r.retentie_90z ?? 0),
    }),
  )

  const global = perSursa.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      contactati: acc.contactati + r.contactati,
      proba: acc.proba + r.proba,
      prezenti: acc.prezenti + r.prezenti,
      convertiti: acc.convertiti + r.convertiti,
      retentieEligibili: acc.retentieEligibili + r.retentieEligibili,
      retentie90z: acc.retentie90z + r.retentie90z,
    }),
    {
      leads: 0,
      contactati: 0,
      proba: 0,
      prezenti: 0,
      convertiti: 0,
      retentieEligibili: 0,
      retentie90z: 0,
    },
  )

  return { global, perSursa }
}

