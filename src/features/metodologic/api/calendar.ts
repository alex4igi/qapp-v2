import { supabase } from '@/lib/supabase'
import type { SezonCalendarRand, TipCalendar } from '../types'

// Calendarul sezonului (module + vacanțe cu date) — fundația: fără el, programele
// nu pot fi activate (trigger în DB).

export async function getSezonEtichete(): Promise<string[]> {
  const { data, error } = await supabase
    .from('sezon_calendar')
    .select('sezon_eticheta')
    .order('sezon_eticheta', { ascending: false })
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.sezon_eticheta))]
}

export async function getCalendarSezon(eticheta: string): Promise<SezonCalendarRand[]> {
  const { data, error } = await supabase
    .from('sezon_calendar')
    .select('*')
    .eq('sezon_eticheta', eticheta)
    .order('numar')
  if (error) throw error
  return data ?? []
}

// Ordinea cronologică a sezonului: modulele și vacanțele intercalate. Rândurile
// fără date (ciornă de sezon nou) rămân la coadă, în ordinea numărului.
export function ordoneazaCalendar(randuri: SezonCalendarRand[]): SezonCalendarRand[] {
  return [...randuri].sort((a, b) => {
    if (a.data_incepere && b.data_incepere) return a.data_incepere.localeCompare(b.data_incepere)
    if (a.data_incepere) return -1
    if (b.data_incepere) return 1
    if (a.tip !== b.tip) return a.tip === 'modul' ? -1 : 1
    return a.numar - b.numar
  })
}

export type CalendarInput = {
  nume: string | null
  nota: string | null
  data_incepere: string | null
  data_final: string | null
}

export async function updateCalendarRand(id: string, patch: CalendarInput): Promise<void> {
  const { error } = await supabase
    .from('sezon_calendar')
    .update({ ...patch, updated: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function addCalendarRand(
  sezon_eticheta: string,
  tip: TipCalendar,
  numar: number,
  patch: CalendarInput
): Promise<void> {
  const { error } = await supabase
    .from('sezon_calendar')
    .insert({ sezon_eticheta, tip, numar, ...patch })
  if (error) throw error
}

export async function deleteCalendarRand(id: string): Promise<void> {
  const { error } = await supabase.from('sezon_calendar').delete().eq('id', id)
  if (error) throw error
}

// Un sezon e „gata de programe" când are cel puțin un modul cu ambele date —
// aceeași condiție ca trigger-ul care blochează activarea programelor.
export function calendarComplet(randuri: SezonCalendarRand[]): {
  moduleTotal: number
  moduleCuDate: number
  gata: boolean
} {
  const module = randuri.filter((r) => r.tip === 'modul')
  const cuDate = module.filter((r) => r.data_incepere && r.data_final)
  return { moduleTotal: module.length, moduleCuDate: cuDate.length, gata: cuDate.length > 0 }
}
