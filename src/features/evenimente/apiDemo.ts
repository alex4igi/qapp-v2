import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'

export type SursaInscriere = 'receptie' | 'walk_in' | 'recomandare'

export type LeadSearchRow = {
  id: string
  nume: string
  prenume: string | null
  telefon: string | null
  status: string | null
}

// Căutare de leaduri pentru înscrierea la demo. Deliberat NU un lookup de tip
// `clientiOptions`: tabelul de leaduri e prea mare ca să fie încărcat întreg
// într-un dropdown.
export async function searchLeads(term: string): Promise<LeadSearchRow[]> {
  const q = term.trim()
  if (q.length < 2) return []
  let query = supabase
    .from('leads')
    .select('id, nume, prenume, telefon, status')
    .limit(20)
  query = applyWordSearch(query, q, ['nume', 'prenume', 'telefon'])
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as LeadSearchRow[]
}

export async function inscrieLaDemo(input: {
  evenimentId: string
  leadId?: string | null
  clientId?: string | null
  sursa?: SursaInscriere
  adusDe?: string | null
  permiteOverbook?: boolean
}): Promise<string> {
  const { data, error } = await supabase.rpc('inscrie_la_demo', {
    p_eveniment: input.evenimentId,
    p_lead: input.leadId ?? undefined,
    p_client: input.clientId ?? undefined,
    p_sursa: input.sursa ?? 'receptie',
    p_adus_de: input.adusDe ?? undefined,
    p_permite_overbook: input.permiteOverbook ?? false,
  })
  if (error) throw error
  return data as string
}

export type WalkInResult = {
  lead_id: string
  created: boolean
  deja_inscris: boolean
}

export async function creeazaLeadSiInscrie(input: {
  evenimentId: string
  nume: string
  telefon: string
  prenume?: string | null
  varsta?: number | null
  interes?: string | null
  adusDe?: string | null
  sursa?: SursaInscriere
  permiteOverbook?: boolean
}): Promise<WalkInResult> {
  const { data, error } = await supabase.rpc('creeaza_lead_si_inscrie_la_demo', {
    p_eveniment: input.evenimentId,
    p_nume: input.nume,
    p_telefon: input.telefon,
    p_prenume: input.prenume ?? undefined,
    p_varsta: input.varsta ?? undefined,
    p_interes: input.interes ?? undefined,
    p_adus_de: input.adusDe ?? undefined,
    p_sursa: input.sursa ?? 'walk_in',
    p_permite_overbook: input.permiteOverbook ?? false,
  })
  if (error) throw error
  return data as unknown as WalkInResult
}

export async function anuleazaInscriereDemo(input: {
  evenimentId: string
  leadId?: string | null
  clientId?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('anuleaza_inscriere_demo', {
    p_eveniment: input.evenimentId,
    p_lead: input.leadId ?? undefined,
    p_client: input.clientId ?? undefined,
  })
  if (error) throw error
}

export async function marcheazaPrezentaClientDemo(
  evenimentId: string,
  clientId: string,
  prezenta: 'programat' | 'prezent' | 'absent',
): Promise<void> {
  const { error } = await supabase.rpc('marcheaza_prezenta_client_demo', {
    p_eveniment: evenimentId,
    p_client: clientId,
    p_prezenta: prezenta,
  })
  if (error) throw error
}

export type DemoFunnelRow = {
  eveniment_id: string
  nume: string
  data: string | null
  ora: string | null
  locatie_nume: string | null
  sala_nume: string | null
  campanie_id: string | null
  campanie_nume: string | null
  curs_tinta_id: string | null
  curs_tinta_nume: string | null
  capacitate: number | null
  inscrisi: number
  prezenti: number
  absenti: number
  clienti_participanti: number
  convertiti: number
  inscrisi_pe_grupa_tinta: number
  contract_semnat: number
}

// Pâlnia unei clase demo: înscriși → prezenți → convertiți → contract semnat.
// Rânduri per slot; agregarea pe campanie se face în componentă.
export async function getDemoFunnel(params: {
  from: string
  to: string
  campanieId?: string | null
}): Promise<DemoFunnelRow[]> {
  const { data, error } = await supabase.rpc('get_demo_funnel', {
    p_from: params.from,
    p_to: params.to,
    p_campanie: params.campanieId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as DemoFunnelRow[]
}
