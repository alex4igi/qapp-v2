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
}

// Cursurile din sezonul activ pentru sălile unei locații (pentru ocupare recurentă).
// Fără locatie → toate sălile. Filtrare pe sezon activ = orarul „în vigoare acum".
export async function listCursuriForCalendar(
  locatieId?: string | null,
): Promise<CursCalendar[]> {
  const sezon = await sezonActivId()
  let q = supabase
    .from('cursuri')
    .select('id, numele, sala, zile, ora, ore_pe_zi, durata_cursului')
    .not('sala', 'is', null)
  if (locatieId) q = q.eq('locatie', locatieId)
  if (sezon) q = q.eq('sezon', sezon)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as CursCalendar[]
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
