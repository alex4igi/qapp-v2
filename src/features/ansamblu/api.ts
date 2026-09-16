import { supabase } from '@/lib/supabase'

export type ClientiActiviRow = {
  locatie_id: string | null
  locatie_nume: string
  activi: number
}

// Headcount „vin efectiv": contract care acoperă ziua de azi SAU prezență în
// ultimele 21 de zile (definiția canonică de activ).
// Rândul cu locatie_id=null = total unic pe club; celelalte = per locație.
export async function getClientiActivi(): Promise<ClientiActiviRow[]> {
  const { data, error } = await supabase.rpc('get_clienti_activi')
  if (error) throw error
  return (data ?? []) as ClientiActiviRow[]
}

export type ClientiInscrisiRow = {
  locatie_id: string | null
  locatie_nume: string
  inscrisi: number
}

// Headcount „câți am pe listă": înrolare nereziliată în sezonul activ.
// Cifra asta nu cade în groapa dintre sezoane (contractele noi încep abia la
// startul sezonului), spre deosebire de getClientiActivi.
export async function getClientiInscrisiSezon(): Promise<ClientiInscrisiRow[]> {
  const { data, error } = await supabase.rpc('get_clienti_inscrisi_sezon')
  if (error) throw error
  return (data ?? []) as ClientiInscrisiRow[]
}

export type OcupareLocatie = {
  locatie_id: string | null
  locatie_nume: string
  ocupate: number
  capacitate: number
  procent: number
}

// Procentul se rotunjește la 2 zecimale, nu la întreg: pragurile de 40/60/80%
// se citesc direct pe cifră, iar 59,8% afișat ca „60%" ar părea atins.
function procentOcupare(ocupate: number, capacitate: number): number {
  return capacitate > 0 ? Math.round((10000 * ocupate) / capacitate) / 100 : 0
}

// Locuri ocupate azi / capacitatea tuturor grupelor, pe locație. O ședință ține
// locul 30 de zile — regula stă în RPC.
export async function getOcuparePeLocatii(): Promise<{
  total: OcupareLocatie
  perLocatie: OcupareLocatie[]
}> {
  const { data, error } = await supabase.rpc('get_ocupare_locatii')
  if (error) throw error
  const perLocatie = (data ?? []).map((r) => ({
    locatie_id: r.locatie_id,
    locatie_nume: r.locatie_nume,
    ocupate: r.ocupate,
    capacitate: r.capacitate,
    procent: procentOcupare(r.ocupate, r.capacitate),
  }))
  const ocupate = perLocatie.reduce((a, r) => a + r.ocupate, 0)
  const capacitate = perLocatie.reduce((a, r) => a + r.capacitate, 0)
  return {
    total: {
      locatie_id: null,
      locatie_nume: 'Total club',
      ocupate,
      capacitate,
      procent: procentOcupare(ocupate, capacitate),
    },
    perLocatie,
  }
}

export type OcupareRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string | null
  teacher_nume: string | null
  facultativ: boolean
  // Locuri ocupate azi — o ședință ține locul 30 de zile (locuri_ocupate).
  activi: number
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

export async function getConversieLeads(
  luni = 12,
  locatieLabel: string | null = null,
): Promise<ConversieLeadsRow> {
  const { data, error } = await supabase.rpc('get_conversie_leads', {
    p_luni: luni,
    // RPC filtrează pe leads.locatia (TEXT label), nu pe uuid
    ...(locatieLabel ? { p_locatie: locatieLabel } : {}),
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
