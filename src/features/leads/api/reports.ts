import { supabase } from '@/lib/supabase'

// Funnel cumulativ pentru Leads → Rapoarte. Cohortă pe data intrării lead-ului
// (leads.created ∈ [from, to]); treptele sunt CUMULATIVE (un convertit se
// numără și la contactați/programați/prezenți) — sursa unică e RPC
// get_lead_funnel, aici doar însumăm rândurile pe surse.
export type LeadFunnelGlobal = {
  noi: number
  contactati: number
  programati: number
  prezenti: number
  convertiti: number
  // Ieșiri (status curent, nu trepte cumulative).
  nuAVenit: number
  pierdut: number
  retentieEligibili: number
  retentie90z: number
}

export async function getLeadFunnelGlobal(
  from: string,
  to: string,
  locatie: string | null,
  grupa: string | null,
): Promise<LeadFunnelGlobal> {
  const { data, error } = await supabase.rpc('get_lead_funnel', {
    p_from: from,
    p_to: to,
    ...(locatie ? { p_locatie: locatie } : {}),
    ...(grupa ? { p_grupa: grupa } : {}),
  })
  if (error) throw error

  const rows = (data ?? []) as Array<Record<string, unknown>>
  return rows.reduce<LeadFunnelGlobal>(
    (acc, r) => ({
      noi: acc.noi + Number(r.leads_total ?? 0),
      contactati: acc.contactati + Number(r.contactati ?? 0),
      programati: acc.programati + Number(r.proba ?? 0),
      prezenti: acc.prezenti + Number(r.prezenti ?? 0),
      convertiti: acc.convertiti + Number(r.convertiti ?? 0),
      nuAVenit: acc.nuAVenit + Number(r.nu_a_venit ?? 0),
      pierdut: acc.pierdut + Number(r.pierdut ?? 0),
      retentieEligibili: acc.retentieEligibili + Number(r.retentie_eligibili ?? 0),
      retentie90z: acc.retentie90z + Number(r.retentie_90z ?? 0),
    }),
    {
      noi: 0,
      contactati: 0,
      programati: 0,
      prezenti: 0,
      convertiti: 0,
      nuAVenit: 0,
      pierdut: 0,
      retentieEligibili: 0,
      retentie90z: 0,
    },
  )
}
