import { supabase } from '@/lib/supabase'
import { sendContracte, type SendResult } from '@/features/contracte/api'
import type {
  CanalContact,
  CazAbsenta,
  MotivAbandon,
  RezultatContact,
  StareAbsenta,
} from './types'

export type FiltruWorklist = {
  locatii: string[] | null
  stari?: StareAbsenta[]
  /** Data intrării în listă, inclusiv (YYYY-MM-DD). */
  deLa?: string | null
  panaLa?: string | null
  sezonId?: string | null
  limit?: number
  offset?: number
}

export async function getWorklistAbsente(
  f: FiltruWorklist,
): Promise<{ randuri: CazAbsenta[]; total: number }> {
  const { data, error } = await supabase.rpc('get_absente_21z_worklist', {
    p_locatii: f.locatii && f.locatii.length > 0 ? f.locatii : undefined,
    p_stari: f.stari,
    p_de_la: f.deLa ?? undefined,
    p_pana_la: f.panaLa ?? undefined,
    p_sezon_id: f.sezonId ?? undefined,
    p_limit: f.limit,
    p_offset: f.offset,
  })
  if (error) throw error
  const randuri = (data ?? []) as CazAbsenta[]
  return { randuri, total: Number(data?.[0]?.total ?? 0) }
}

// Câte cazuri sunt de sunat AZI: intrate și nesunate, plus reîncercările și amânările
// ajunse la termen (aceeași regulă ca `de_sunat` din get_absente_21z_worklist). Count pur
// (`head: true`) pentru insigna din /overview — lista întoarce tot istoricul de cazuri.
export async function getAbsente21zCount(
  locatieId: string | null,
  deLaData: string | null,
): Promise<number> {
  const azi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
  let q = supabase
    .from('absente_21z')
    .select('id', { count: 'exact', head: true })
    .or(`stare.eq.de_contactat,and(stare.in.(reincercare,amanat),urmatoarea_incercare.lte.${azi})`)
  if (locatieId) q = q.eq('locatie', locatieId)
  if (deLaData) q = q.gte('data_intrare', deLaData)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function getMotiveAbandon(): Promise<MotivAbandon[]> {
  const { data, error } = await supabase
    .from('motive_abandon')
    .select('id, eticheta')
    .eq('activ', true)
    .order('ordine')
  if (error) throw error
  return data ?? []
}

export async function marcheazaContact(input: {
  absentaId: string
  canal: CanalContact
  rezultat: RezultatContact
  motivId: string | null
  motivLiber: string | null
  pasUrmator: string | null
  observatii: string | null
  dataRevenire: string | null
}) {
  const { error } = await supabase.rpc('marcheaza_contact_absenta', {
    p_absenta_id: input.absentaId,
    p_canal: input.canal,
    p_rezultat: input.rezultat,
    p_motiv_id: input.motivId ?? undefined,
    p_motiv_liber: input.motivLiber ?? undefined,
    p_pas_urmator: input.pasUrmator ?? undefined,
    p_observatii: input.observatii ?? undefined,
    p_data_revenire: input.dataRevenire ?? undefined,
  })
  if (error) throw error
}

export async function decideReziliere(input: {
  absentaId: string
  reziliaza: boolean
  nota: string | null
}): Promise<{ stare: string; inrolari_reziliate: number }> {
  const { data, error } = await supabase.rpc('decide_reziliere_absenta', {
    p_absenta_id: input.absentaId,
    p_reziliaza: input.reziliaza,
    p_nota: input.nota ?? undefined,
  })
  if (error) throw error
  return data as { stare: string; inrolari_reziliate: number }
}

// Emailul familiei, din care pleacă cererea de reziliere. Fără email cererea nu se trimite.
export async function getEmailFamilie(clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clienti')
    .select('familii(email)')
    .eq('id', clientId)
    .single()
  if (error) throw error
  const fam = data.familii as { email: string | null } | null
  return fam?.email?.trim() || null
}

// Cererea de reziliere la dosar (Alex, 08.10.2026): rezilierea e valabilă imediat, iar
// familia primește șablonul „Cerere Reziliere" de completat și semnat — DOAR pe email.
// Fără email nu se trimite nimic (contract-send refuză și el).
export async function trimiteCerereReziliere(clientId: string): Promise<SendResult> {
  const { data: client, error: eClient } = await supabase
    .from('clienti')
    .select('familia')
    .eq('id', clientId)
    .single()
  if (eClient) throw eClient
  if (!client.familia) {
    throw new Error('Clientul nu are familie în fișă. Completează familia, apoi trimite cererea.')
  }
  const { data: tpl, error: eTpl } = await supabase
    .from('contract_templates')
    .select('id')
    .eq('tip', 'cerere_reziliere')
    .eq('activ', true)
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eTpl) throw eTpl
  if (!tpl) throw new Error('Nu există un șablon activ „Cerere Reziliere" în Contracte.')
  const [r] = await sendContracte({
    templateId: tpl.id,
    targets: [{ familieId: client.familia, clientId }],
  })
  if (!r) throw new Error('Cererea nu s-a trimis.')
  if (!r.ok && !r.statusExistent) throw new Error(r.error ?? 'Cererea nu s-a trimis.')
  return r
}
