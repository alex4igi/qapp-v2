import { supabase } from '@/lib/supabase'

// Cursul ultimei programări a lead-ului (pentru precompletarea înrolării).
//
// Programarea pe o clasă demo n-are `cursul_programat` — cade pe `curs_tinta`
// (grupa reală spre care duce demoul). Altfel formularul de înrolare venea gol
// exact pentru leadurile care tocmai fuseseră la demo.
export async function getLatestProgramareCurs(
  leadId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('programari_leads')
    .select('cursul_programat, eveniment_rel:evenimente(curs_tinta)')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const ev = data.eveniment_rel as { curs_tinta: string | null } | null
  return data.cursul_programat ?? ev?.curs_tinta ?? null
}

// Ultima programare (curs SAU eveniment) — pentru pre-completarea selecției în
// LeadModal la editarea unui lead deja programat.
export async function getLatestProgramare(
  leadId: string,
): Promise<{ cursId: string | null; evenimentId: string | null } | null> {
  const { data } = await supabase
    .from('programari_leads')
    .select('cursul_programat, eveniment_programat')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    cursId: data.cursul_programat ?? null,
    evenimentId: data.eveniment_programat ?? null,
  }
}

// Programează SMS-ul de confirmare prin RPC — upsert în coada
// `confirmari_programare_sms` cu send_after = now()+2min (resetat la re-editare în
// fereastră). Confirmarea se leagă de PROGRAMARE: dă-i id-ul rândului tocmai creat,
// ca undo-ul (scoaterea de pe listă) să oprească SMS-ul și ca o reprogramare să-și
// primească propria confirmare. Fără el, RPC-ul cade pe ultima programare a
// leadului. Drenarea o face edge fn `process-programare-sms`.
export async function enqueueConfirmareProgramare(
  leadId: string,
  programareId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('enqueue_confirmare_programare', {
    p_lead: leadId,
    p_programare: programareId ?? undefined,
  })
  if (error) throw error
}

export type CursProgramabil = {
  id: string
  numele: string
  varsta: string | null
  zile: string[] | null
  locatie: string | null
  ora: string | null
  ore_pe_zi: Record<string, string> | null
}

// Cursurile nesuspendate, pentru dropdown-ul de programare din LeadModal.
export async function listCursuriProgramabile(
  sezonId?: string | null,
): Promise<CursProgramabil[]> {
  // Fail-closed: fără sezon nu întoarcem cursuri din toate sezoanele (ar apărea
  // orare arhivate în dropdown-ul de programare).
  if (!sezonId) return []
  const { data, error } = await supabase
    .from('cursuri')
    .select('id, numele, varsta, zile, locatie, ora, ore_pe_zi')
    .eq('suspendat', false)
    .eq('sezon', sezonId)
    .order('numele', { ascending: true })
  if (error) throw error
  return (data ?? []) as CursProgramabil[]
}

export type EvenimentProgramabil = {
  id: string
  nume_eveniment: string
  ora: string | null
  locatia: string | null
  capacitate: number | null
  /** Locuri ocupate — aceeași sumă ca `locuri_ocupate_eveniment()` din DB. */
  ocupat: number
}

// Evenimentele dintr-o anumită zi — apar în dropdown-ul de programare alături de
// cursurile recurente (orele demonstrative/gratuite pot fi create ca evenimente).
//
// Ocuparea vine odată cu ele: fără ea recepția afla că slotul e plin abia din
// eroarea de la salvare, cu clientul pe fir.
export async function listEvenimenteProgramabile(
  date: string,
): Promise<EvenimentProgramabil[]> {
  const { data, error } = await supabase
    .from('evenimente')
    .select(
      'id, nume_eveniment, ora, locatia, capacitate, programari_leads(count), evenimente_participanti(count)',
    )
    .eq('data', date)
    .order('ora', { ascending: true, nullsFirst: false })
    .order('nume_eveniment', { ascending: true })
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: e.id,
    nume_eveniment: e.nume_eveniment,
    ora: e.ora,
    locatia: e.locatia,
    capacitate: e.capacitate ?? null,
    ocupat:
      (e.programari_leads?.[0]?.count ?? 0) +
      (e.evenimente_participanti?.[0]?.count ?? 0),
  }))
}

// Creează rândul de programare care leagă lead-ul de un curs la o dată.
// Activează badge-ul "LEAD" pe roster-ul grupei respective.
export async function createProgramareLead(input: {
  lead: string
  cursul_programat?: string | null
  eveniment_programat?: string | null
  locatie: string | null
  data_programarii: string
  ora?: string | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('programari_leads')
    .insert({
      lead: input.lead,
      cursul_programat: input.cursul_programat ?? null,
      eveniment_programat: input.eveniment_programat ?? null,
      locatie: input.locatie,
      data_programarii: input.data_programarii,
      ora: input.ora ?? null,
      prezenta: 'programat',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
