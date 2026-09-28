import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// Campania de recomandări — regulile în docs/reguli-domeniu.md §Recomandări.
// Scrierea trece doar prin RPC (tabelele sunt read-only pentru aplicație).

export type RandRaportRecomandare =
  Database['public']['Functions']['raport_recomandari']['Returns'][number]

export type StatusRecomandare =
  | 'declarat' | 'verificat' | 'proba' | 'inrolat' | 'eligibil' | 'recompensat' | 'anulat'

export type Recomandare = {
  id: string
  status: StatusRecomandare
  canal: string
  nume_declarat: string | null
  familie_recomandatoare: string | null
  client_recomandator: string | null
  curs_recomandator: string | null
  motiv_anulare: string | null
  created: string
  campanie: { nume: string; data_limita: string; recompensa_lei: number } | null
  familie: { nume_familie: string } | null
  recomandator: { nume: string; prenume: string | null } | null
}

export type MiscareCredit = {
  id: string
  suma: number
  tip: 'acordat' | 'consumat' | 'anulat' | 'restituit'
  motiv: string | null
  created: string
  enrollment_id: string | null
  datorie_id: string | null
}

export const STATUS_LABEL: Record<StatusRecomandare, string> = {
  declarat: 'De verificat',
  verificat: 'Familie confirmată',
  proba: 'A făcut proba',
  inrolat: 'Înscris, neachitat',
  eligibil: 'Achitat — familie neconfirmată',
  recompensat: 'Credit acordat',
  anulat: 'Anulată',
}

export async function getCampanieActiva() {
  const { data, error } = await supabase
    .from('campanii_recomandare')
    .select('id, nume, data_start, data_limita, recompensa_lei')
    .order('data_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
  return { ...data, activa: azi >= data.data_start && azi <= data.data_limita }
}

export async function getRecomandareLead(leadId: string): Promise<Recomandare | null> {
  const { data, error } = await supabase
    .from('recomandari')
    .select(
      'id, status, canal, nume_declarat, familie_recomandatoare, client_recomandator, curs_recomandator, motiv_anulare, created, ' +
        'campanie:campanii_recomandare(nume, data_limita, recompensa_lei), ' +
        'familie:familii!recomandari_familie_recomandatoare_fkey(nume_familie), ' +
        'recomandator:clienti!recomandari_client_recomandator_fkey(nume, prenume)',
    )
    .eq('lead_id', leadId)
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as unknown as Recomandare | null
}

export async function atribuieRecomandare(p: {
  leadId: string
  clientRecomandator: string | null
  cursId?: string | null
  numeDeclarat?: string | null
  canal?: 'site' | 'telefon' | 'receptie'
}): Promise<string> {
  const { data, error } = await supabase.rpc('atribuie_recomandare', {
    p_lead: p.leadId,
    p_client_recomandator: p.clientRecomandator as string,
    p_curs: p.cursId ?? undefined,
    p_nume_declarat: p.numeDeclarat ?? undefined,
    p_canal: p.canal ?? 'receptie',
  })
  if (error) throw error
  return data as string
}

export async function anuleazaRecomandare(id: string, motiv: string): Promise<void> {
  const { error } = await supabase.rpc('anuleaza_recomandare', { p_id: id, p_motiv: motiv })
  if (error) throw error
}

export async function raportRecomandari(): Promise<RandRaportRecomandare[]> {
  const { data, error } = await supabase.rpc('raport_recomandari', {})
  if (error) throw error
  return data ?? []
}

export async function clientAreRecomandare(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('client_are_recomandare', { p_client: clientId })
  if (error) throw error
  return data === true
}

export async function getCreditFamilie(
  familieId: string,
): Promise<{ sold: number; miscari: MiscareCredit[] }> {
  const { data, error } = await supabase
    .from('credit_familie_miscari')
    .select('id, suma, tip, motiv, created, enrollment_id, datorie_id')
    .eq('familie', familieId)
    .order('created', { ascending: false })
  if (error) throw error
  const miscari = (data ?? []) as MiscareCredit[]
  const sold = Math.round(miscari.reduce((s, m) => s + Number(m.suma), 0) * 100) / 100
  return { sold, miscari }
}

// Familia unui client (creditul e pe familie, nu pe client).
export async function getFamilieClient(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clienti')
    .select('familia')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data?.familia ?? null
}

// Nu creează încasare: scade suma datorată a rândului și lasă urma în registrul creditului.
export async function consumaCreditFamilie(p: {
  familieId: string
  suma: number
  enrollmentId?: string | null
  datorieId?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('consuma_credit_familie', {
    p_familie: p.familieId,
    p_suma: p.suma,
    p_enrollment: p.enrollmentId ?? undefined,
    p_datorie: p.datorieId ?? undefined,
  })
  if (error) throw error
}
