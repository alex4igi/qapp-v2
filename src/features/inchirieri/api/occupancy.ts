import { supabase } from '@/lib/supabase'
import { sezonActivId } from '@/lib/lookups'
import { getOrePeZi, ZI_TO_JS } from '@/features/cursuri/program'
import { timeToMinutes } from '@/lib/inchirieriPricing'
import type { Enums } from '@/types/db'

// Curs proiectabil pe săptămână: doar câmpurile de orar.
export type CursCalendar = {
  id: string
  numele: string | null
  sala: string | null
  zile: Enums<'zi_saptamana'>[] | null
  ora: string | null
  ore_pe_zi: unknown
  durata_cursului: number | null
  /** Intervalele de suspendare [din_luna, pana_luna). Sala e liberă în ele. */
  suspendari: { din_luna: string; pana_luna: string | null }[]
}

// O grupă suspendată nu mai ține sala ocupată — se poate închiria în lunile de
// pauză. Verificarea e pe ZI, nu pe „acum": săptămâna afișată poate cădea în
// altă lună decât cea curentă (și poate chiar să le încalece pe amândouă).
export function cursSuspendatLaData(c: CursCalendar, dataIso: string): boolean {
  const luna = `${dataIso.slice(0, 7)}-01`
  return (c.suspendari ?? []).some(
    (s) => luna >= s.din_luna && (s.pana_luna == null || luna < s.pana_luna),
  )
}

// Cursurile din sezonul activ pentru sălile unei locații (pentru ocupare recurentă).
// Fără locatie → toate sălile. Filtrare pe sezon activ = orarul „în vigoare acum".
export async function listCursuriForCalendar(
  locatieId?: string | null,
): Promise<CursCalendar[]> {
  const sezon = await sezonActivId()
  // Fail-closed: fără sezon activ nu proiectăm nimic (altfel ar apărea cursuri
  // din TOATE sezoanele, inclusiv orare arhivate).
  if (!sezon) return []
  let q = supabase
    .from('cursuri')
    .select(
      'id, numele, sala, zile, ora, ore_pe_zi, durata_cursului, suspendari:cursuri_suspendari(din_luna, pana_luna)',
    )
    .not('sala', 'is', null)
    .eq('sezon', sezon)
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as CursCalendar[]
}

export type InchiriereCalendar = {
  id: string
  sala: string
  data: string
  ora_start: string
  ora_final: string
  tier: Enums<'tier_inchiriere'>
  pret: number | null
  status_plata: Enums<'status_plata_inchiriere'>
  teacher: string | null
  client: string | null
  guest_nume: string | null
  guest_tel: string | null
  observatii: string | null
  teacher_rel: { nume: string | null; prenume: string | null } | null
  client_rel: { nume: string | null; prenume: string | null } | null
}

// Închirierile dintr-un interval de date (săptămâna vizibilă), pentru sălile locației.
export async function listInchirieriWeek(params: {
  fromIso: string
  toIso: string
  locatieId?: string | null
}): Promise<InchiriereCalendar[]> {
  let q = supabase
    .from('inchirieri')
    .select(
      'id, sala, data, ora_start, ora_final, tier, pret, status_plata, teacher, client, guest_nume, guest_tel, observatii, teacher_rel:teacheri(nume,prenume), client_rel:clienti(nume,prenume)',
    )
    .gte('data', params.fromIso)
    .lte('data', params.toIso)
  if (params.locatieId) q = q.eq('locatie', params.locatieId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as InchiriereCalendar[]
}

export type OcupareInchiriere = {
  /** null = rezervarea altcuiva, văzută de un instructor (fără detalii). */
  id: string | null
  sala: string
  data: string
  ora_start: string
  ora_final: string
  pret: number | null
  status_plata: Enums<'status_plata_inchiriere'> | null
  eticheta: string
  a_mea: boolean
}

// Toate rezervările din interval, pentru grilă și verificarea de suprapunere. Trece
// prin RPC: instructorul nu citește tabelul `inchirieri` decât pentru rândurile lui,
// dar trebuie să vadă că sala e ocupată.
export async function listOcupareInchirieri(params: {
  fromIso: string
  toIso: string
  locatieId?: string | null
  salaId?: string | null
}): Promise<OcupareInchiriere[]> {
  const { data, error } = await supabase.rpc('get_ocupare_inchirieri', {
    p_de: params.fromIso,
    p_pana: params.toIso,
    p_locatie: params.locatieId ?? undefined,
    p_sala: params.salaId ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as OcupareInchiriere[]
}

export type InchiriereNeachitata = {
  id: string
  data: string
  ora_start: string
  ora_final: string
  pret: number
  status_plata: Enums<'status_plata_inchiriere'>
  sala_nume: string | null
  renter: string
  rest: number // pret - suma încasată
}

// Toate închirierile cu sold rămas (status ≠ achitat, preț > 0), pentru worklist-ul
// de recuperare. Rest-ul = preț − încasările legate de închiriere.
export async function listInchirieriNeachitate(params: {
  locatieId?: string | null
}): Promise<InchiriereNeachitata[]> {
  let q = supabase
    .from('inchirieri')
    .select(
      'id, data, ora_start, ora_final, pret, status_plata, guest_nume, teacher_rel:teacheri(nume,prenume), client_rel:clienti(nume,prenume), sala_rel:sali(nume), incasari(suma)',
    )
    .neq('status_plata', 'achitat')
    .gt('pret', 0)
    .order('data', { ascending: true })
  if (params.locatieId) q = q.eq('locatie', params.locatieId)
  const { data, error } = await q
  if (error) throw error
  type Row = {
    id: string
    data: string
    ora_start: string
    ora_final: string
    pret: number | null
    status_plata: Enums<'status_plata_inchiriere'>
    guest_nume: string | null
    teacher_rel: { nume: string | null; prenume: string | null } | null
    client_rel: { nume: string | null; prenume: string | null } | null
    sala_rel: { nume: string | null } | null
    incasari: { suma: number | null }[] | null
  }
  return ((data ?? []) as unknown as Row[])
    .map((r) => {
      const incasat = (r.incasari ?? []).reduce((s, i) => s + (Number(i.suma) || 0), 0)
      const rest = Math.round((Number(r.pret ?? 0) - incasat) * 100) / 100
      const renter = r.teacher_rel
        ? `${r.teacher_rel.nume ?? ''} ${r.teacher_rel.prenume ?? ''}`.trim()
        : r.client_rel
          ? `${r.client_rel.nume ?? ''} ${r.client_rel.prenume ?? ''}`.trim()
          : (r.guest_nume ?? 'guest')
      return {
        id: r.id,
        data: r.data,
        ora_start: r.ora_start,
        ora_final: r.ora_final,
        pret: Number(r.pret ?? 0),
        status_plata: r.status_plata,
        sala_nume: r.sala_rel?.nume ?? null,
        renter,
        rest,
      }
    })
    .filter((r) => r.rest > 0.004)
}

export type InchiriereMea = {
  id: string
  data: string
  ora_start: string
  ora_final: string
  pret: number | null
  status_plata: Enums<'status_plata_inchiriere'>
  sala_nume: string | null
}

// Rezervările unui teacher (self-service): de la `fromIso` încolo.
export async function listInchirieriByTeacher(
  teacherId: string,
  fromIso: string,
): Promise<InchiriereMea[]> {
  const { data, error } = await supabase
    .from('inchirieri')
    .select('id, data, ora_start, ora_final, pret, status_plata, sala_rel:sali(nume)')
    .eq('teacher', teacherId)
    .gte('data', fromIso)
    .order('data', { ascending: true })
    .order('ora_start', { ascending: true })
  if (error) throw error
  type Row = Omit<InchiriereMea, 'sala_nume'> & {
    sala_rel: { nume: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map(({ sala_rel, ...r }) => ({
    ...r,
    sala_nume: sala_rel?.nume ?? null,
  }))
}

// Nume afișabil al chiriașului pentru eticheta din calendar.
export function renterLabel(r: InchiriereCalendar): string {
  if (r.teacher_rel) return `${r.teacher_rel.nume ?? ''} ${r.teacher_rel.prenume ?? ''}`.trim()
  if (r.client_rel) return `${r.client_rel.nume ?? ''} ${r.client_rel.prenume ?? ''}`.trim()
  return r.guest_nume ?? 'guest'
}

// Ora de start a unui curs pentru o anumită zi (ore_pe_zi override → ora unică).
export function cursStartMinForWeekday(
  c: CursCalendar,
  weekday: number,
): number | null {
  const zi = (c.zile ?? []).find((z) => ZI_TO_JS[z] === weekday)
  if (!zi) return null
  const map = getOrePeZi({ ore_pe_zi: c.ore_pe_zi as never })
  const ora = map?.[zi] ?? c.ora
  return timeToMinutes(ora)
}

export type EvenimentCalendar = {
  id: string
  nume_eveniment: string
  tip: Enums<'tip_eveniment'>
  data: string
  ora: string | null
  durata_min: number | null
  sala: string
}

// Evenimentele cu sală dintr-un interval de date.
//
// Spre deosebire de cursuri, AICI NU filtrăm pe sezonul activ: o clasă demo se
// ține oricând — între sezoane, în vacanță, în afara orarului. Exact ăsta e
// scopul: să nu se rezerve sala peste ea. Garda de sezon trăiește doar în
// `listCursuriForCalendar`, deci fără sezon activ dispar cursurile, nu demourile.
export async function listEvenimenteWeek(params: {
  fromIso: string
  toIso: string
  locatieId?: string | null
}): Promise<EvenimentCalendar[]> {
  let q = supabase
    .from('evenimente')
    .select('id, nume_eveniment, tip, data, ora, durata_min, sala')
    .not('sala', 'is', null)
    .gte('data', params.fromIso)
    .lte('data', params.toIso)
    .or('status.is.null,status.neq.Anulat')
  if (params.locatieId) q = q.eq('locatie_id', params.locatieId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as EvenimentCalendar[]
}
