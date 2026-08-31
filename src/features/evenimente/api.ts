import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Eveniment, InsertDto, UpdateDto } from '@/types/db'
import { fetchAllRows } from '@/lib/fetchAll'

export const PAGE_SIZE = 25

export type EvenimenteListParams = {
  search: string
  page: number
  an?: number | null
  tip?: string | null
  temporal?: 'all' | 'viitoare' | 'trecute'
  today?: string // YYYY-MM-DD, pasat din componentă pentru filtrul Viitoare/Trecute
}
export type EvenimentCuGrupa = Eveniment & {
  curs_rel: { numele: string } | null
}
export type EvenimenteListResult = { rows: EvenimentCuGrupa[]; total: number }

export async function listEvenimente({
  search,
  page,
  an,
  tip,
  temporal = 'all',
  today,
}: EvenimenteListParams): Promise<EvenimenteListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('evenimente')
    // FK explicit: `evenimente` are DOUĂ relații către `cursuri` (`curs` = eveniment
    // exclusiv unei grupe, `curs_tinta` = grupa spre care duce o clasă demo), iar
    // fără dezambiguizare PostgREST refuză embed-ul (PGRST201).
    .select('*, curs_rel:cursuri!evenimente_curs_fkey(numele)', { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(from, to)

  query = applyWordSearch(query, search, ['nume_eveniment', 'locatia'])

  if (an) {
    query = query.gte('data', `${an}-01-01`).lte('data', `${an}-12-31`)
  }
  if (tip) {
    query = query.eq('tip', tip as Eveniment['tip'])
  }
  if (today && temporal === 'viitoare') {
    query = query.gte('data', today)
  } else if (today && temporal === 'trecute') {
    query = query.lt('data', today)
  }

  const { data, error, count } = await query
  if (error) throw error
  return {
    rows: (data ?? []) as unknown as EvenimentCuGrupa[],
    total: count ?? 0,
  }
}

// Anii disponibili (descrescător) din `data` evenimentelor; include mereu anul curent.
export async function listEvenimenteAni(): Promise<number[]> {
  const maxRes = await supabase
    .from('evenimente')
    .select('data')
    .not('data', 'is', null)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxRes.error) throw maxRes.error
  const minRes = await supabase
    .from('evenimente')
    .select('data')
    .not('data', 'is', null)
    .order('data', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (minRes.error) throw minRes.error

  const yearOf = (d?: string | null) => (d ? Number(d.slice(0, 4)) : null)
  const nowY = new Date().getFullYear()
  const hi = Math.max(yearOf(maxRes.data?.data) ?? nowY, nowY)
  const lo = Math.min(yearOf(minRes.data?.data) ?? nowY, nowY)
  const years: number[] = []
  for (let y = hi; y >= lo; y--) years.push(y)
  return years
}

// Evenimentele unei grupe (tab Evenimente de pe pagina grupei).
export async function listEvenimenteGrupa(cursId: string): Promise<Eveniment[]> {
  const { data, error } = await supabase
    .from('evenimente')
    .select('*')
    .eq('curs', cursId)
    .order('data', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function createEveniment(
  dto: InsertDto<'evenimente'>,
): Promise<Eveniment> {
  const { data, error } = await supabase
    .from('evenimente')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateEveniment(
  id: string,
  dto: UpdateDto<'evenimente'>,
): Promise<Eveniment> {
  const { data, error } = await supabase
    .from('evenimente')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteEveniment(id: string): Promise<void> {
  const { error } = await supabase.from('evenimente').delete().eq('id', id)
  if (error) throw error
}

// ── Roster eveniment ────────────────────────────────────────────────────────

export type EvenimentRosterRow = {
  refId: string
  kind: 'client' | 'lead'
  nume: string
  prenume: string | null
  foto: string | null
  telefon: string | null
  platit: number
  rest: number
  neplatit: boolean
  /** Adăugat manual în `participant[]` (vs. doar cumpărător de bilet). */
  manual: boolean
  /** Lead programat la acest eveniment (oră demonstrativă), via programari_leads. */
  scheduled: boolean
  /** Pentru lead-urile programate: starea prezenței. null pentru clienți/bilete. */
  prezenta: 'programat' | 'prezent' | 'absent' | null
  /** Rândul din programari_leads vizat de marcarea prezenței. */
  programareId: string | null
  /** Statusul global al lead-ului — doar pentru afișare (convertit / pierdut). */
  statusLead: string | null
}

export type EvenimentRoster = {
  id: string
  nume: string
  tip: Eveniment['tip']
  data: string | null
  ora: string | null
  locatia: string | null
  pretBilet: number | null
  capacitate: number | null
  participant: string[]
  roster: EvenimentRosterRow[]
}

// Participanții unui eveniment = adăugați manual (`participant[]`, id-uri de
// clienți) ∪ cumpărători de bilet (incasari.bilet = eveniment_id, client sau
// lead/guest). Pentru fiecare se calculează suma plătită la acest eveniment și
// restul față de prețul biletului. Compunere client-side, fără RPC nou.
export async function getEvenimentRoster(
  evenimentId: string,
): Promise<EvenimentRoster> {
  const evRes = await supabase
    .from('evenimente')
    .select(
      'id, nume_eveniment, tip, data, ora, locatia, pret_bilet, capacitate, participant',
    )
    .eq('id', evenimentId)
    .single()
  if (evRes.error) throw evRes.error
  const ev = evRes.data

  // Paginat: un eveniment mare (1000+ încasări de bilete) ar trunchia lista.
  const incRows = await fetchAllRows(() =>
    supabase
      .from('incasari')
      .select('client, lead, suma, id')
      .eq('bilet', evenimentId)
      .order('id', { ascending: true }),
  )

  // Sumă plătită per persoană (client sau lead).
  const platitByPerson = new Map<string, number>()
  const leadIds = new Set<string>()
  for (const r of incRows) {
    const key = r.client ?? r.lead
    if (!key) continue
    if (r.lead && !r.client) leadIds.add(r.lead)
    platitByPerson.set(key, (platitByPerson.get(key) ?? 0) + (r.suma ?? 0))
  }

  const clientIds = new Set<string>(ev.participant ?? [])
  for (const r of incRows) {
    if (r.client) clientIds.add(r.client)
  }

  const [clientiRes, leadsRes] = await Promise.all([
    clientIds.size > 0
      ? supabase
          .from('clienti')
          .select('id, nume, prenume, foto, telefon')
          .in('id', [...clientIds])
      : Promise.resolve({ data: [], error: null } as const),
    leadIds.size > 0
      ? supabase
          .from('leads')
          .select('id, nume, prenume, telefon')
          .in('id', [...leadIds])
      : Promise.resolve({ data: [], error: null } as const),
  ])
  if (clientiRes.error) throw clientiRes.error
  if (leadsRes.error) throw leadsRes.error

  const pret = ev.pret_bilet ?? null
  const manualSet = new Set<string>(ev.participant ?? [])
  const buildRow = (
    refId: string,
    kind: 'client' | 'lead',
    nume: string,
    prenume: string | null,
    foto: string | null,
    telefon: string | null,
  ): EvenimentRosterRow => {
    const platit = platitByPerson.get(refId) ?? 0
    const rest = pret != null ? Math.max(0, pret - platit) : 0
    return {
      refId,
      kind,
      nume,
      prenume,
      foto,
      telefon,
      platit,
      rest,
      neplatit: platit === 0,
      manual: kind === 'client' && manualSet.has(refId),
      scheduled: false,
      prezenta: null,
      programareId: null,
      statusLead: null,
    }
  }

  const roster: EvenimentRosterRow[] = []
  for (const c of clientiRes.data ?? []) {
    roster.push(buildRow(c.id, 'client', c.nume, c.prenume, c.foto, c.telefon))
  }
  for (const l of leadsRes.data ?? []) {
    roster.push(buildRow(l.id, 'lead', l.nume, l.prenume, null, l.telefon))
  }

  // Lead-urile programate la acest eveniment (oră demonstrativă) — din
  // programari_leads.eveniment_programat.
  //
  // Prezența vine din `programari_leads.prezenta` (per programare), NU din
  // `leads.status` (global). Statusul se schimbă în timp — un lead care a venit
  // la demo și s-a înscris devine `convertit` și dispărea complet din roster,
  // exact persoana pe care demoul o urmărește. Același raționament ca la rosterul
  // grupei (dashboard/api/grupa.ts).
  const progRes = await supabase
    .from('programari_leads')
    .select(
      'id, prezenta, created, lead:leads(id, nume, prenume, status, id_client, telefon)',
    )
    .eq('eveniment_programat', evenimentId)
    .order('created', { ascending: true })
  if (progRes.error) throw progRes.error

  const scheduledLeadIds = new Set<string>()
  // Clienții rezultați din conversia unui lead prezent aici: rândul de lead e cel
  // care poartă prezența, deci pe cel de client îl scoatem ca să nu apară de două ori.
  const convertedClientIds = new Set<string>()

  for (const p of (progRes.data ?? []) as unknown as Array<{
    id: string
    prezenta: 'programat' | 'prezent' | 'absent' | null
    lead: {
      id: string
      nume: string
      prenume: string | null
      status: string | null
      id_client: string | null
      telefon: string | null
    } | null
  }>) {
    if (!p.lead || scheduledLeadIds.has(p.lead.id)) continue
    scheduledLeadIds.add(p.lead.id)
    if (p.lead.id_client) convertedClientIds.add(p.lead.id_client)

    const row =
      roster.find((r) => r.kind === 'lead' && r.refId === p.lead!.id) ??
      (() => {
        const fresh = buildRow(
          p.lead!.id,
          'lead',
          p.lead!.nume,
          p.lead!.prenume,
          null,
          p.lead!.telefon,
        )
        roster.push(fresh)
        return fresh
      })()
    row.scheduled = true
    row.prezenta = p.prezenta ?? 'programat'
    row.programareId = p.id
    row.statusLead = p.lead.status
  }

  for (let i = roster.length - 1; i >= 0; i--) {
    const r = roster[i]
    if (r.kind === 'client' && convertedClientIds.has(r.refId) && !r.manual) {
      roster.splice(i, 1)
    }
  }

  // Cursanții înscriși explicit (evenimente_participanti) — au prezență proprie.
  // `evenimente.participant[]` rămâne sincronizat prin dual-write, dar prezența
  // trăiește doar în tabel: un array de uuid-uri n-are unde s-o țină.
  const partRes = await supabase
    .from('evenimente_participanti')
    .select('client, prezenta, adus_de')
    .eq('eveniment', evenimentId)
  if (partRes.error) throw partRes.error
  for (const p of partRes.data ?? []) {
    const row = roster.find((r) => r.kind === 'client' && r.refId === p.client)
    if (row) row.prezenta = p.prezenta ?? 'programat'
  }

  roster.sort((a, b) =>
    [a.nume, a.prenume].join(' ').localeCompare([b.nume, b.prenume].join(' '), 'ro'),
  )

  return {
    id: ev.id,
    nume: ev.nume_eveniment,
    tip: ev.tip,
    data: ev.data,
    ora: ev.ora,
    locatia: ev.locatia,
    pretBilet: pret,
    capacitate: ev.capacitate ?? null,
    participant: ev.participant ?? [],
    roster,
  }
}

// Eveniment complet (pt. formularul de editare deschis din roster).
export async function getEveniment(id: string): Promise<Eveniment> {
  const { data, error } = await supabase
    .from('evenimente')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ── Bilete online (ticketing spectacole) ────────────────────────────────────

export type BiletOnline = {
  id: string
  cod: string | null
  status: string
  pret: number
  validat_at: string | null
  clientNume: string | null
}

// Biletele vândute online pentru un eveniment (rânduri `bilete` cu status platit/validat).
export async function getBileteEveniment(
  evenimentId: string,
): Promise<BiletOnline[]> {
  const { data, error } = await supabase
    .from('bilete')
    .select('id, cod, status, pret, validat_at, client_rel:clienti(nume, prenume)')
    .eq('eveniment', evenimentId)
    .in('status', ['platit', 'validat'])
    .order('cod', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Array<{
    id: string
    cod: string | null
    status: string
    pret: number
    validat_at: string | null
    client_rel: { nume: string; prenume: string | null } | null
  }>).map((b) => ({
    id: b.id,
    cod: b.cod,
    status: b.status,
    pret: b.pret,
    validat_at: b.validat_at,
    clientNume: b.client_rel
      ? `${b.client_rel.nume} ${b.client_rel.prenume ?? ''}`.trim()
      : null,
  }))
}

export type ValidareBilet = {
  ok: boolean
  reason?: string
  eveniment?: string
  client?: string
  pret?: number
  validat_at?: string
}

// Validare la ușă — staff scanează/introduce codul. Idempotent-safe (refuză dubla-validare).
export async function valideazaBilet(cod: string): Promise<ValidareBilet> {
  const { data, error } = await supabase.rpc('valideaza_bilet', { p_cod: cod })
  if (error) throw error
  return data as ValidareBilet
}

// Gestiune participanți — RPC-uri staff-gated (vezi migrarea
// 20260624100000); singura cale prin care recepția modifică un eveniment.
export async function addEvenimentParticipant(
  evenimentId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase.rpc('add_eveniment_participant', {
    p_eveniment: evenimentId,
    p_client: clientId,
  })
  if (error) throw error
}

export async function removeEvenimentParticipant(
  evenimentId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_eveniment_participant', {
    p_eveniment: evenimentId,
    p_client: clientId,
  })
  if (error) throw error
}
