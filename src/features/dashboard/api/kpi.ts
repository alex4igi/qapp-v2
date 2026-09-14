import { supabase } from '@/lib/supabase'
import {
  INCASARI_SALA_SELECT,
  PROGRAMARI_SALA_SELECT,
  incasareInSali,
  programareInSali,
  type IncasareSalaRefs,
  type ProgramareSalaRefs,
  type SalaFilter,
} from './salaFilter'

export type DashboardKpis = {
  incasariAzi: number
  programariAzi: number
}

// KPI-uri din topbar-ul dashboard-ului zilei: încasări la data X și număr de
// programări lead pe data X. Respectă locația din header și sălile bifate.
export async function getDashboardKpis(
  date: string,
  locatieId?: string | null,
  sali: SalaFilter | null = null,
): Promise<DashboardKpis> {
  let incQ = supabase
    .from('incasari')
    .select(`suma, ${INCASARI_SALA_SELECT}`)
    .eq('data', date)
  if (locatieId) incQ = incQ.eq('locatie', locatieId)
  let progQ = supabase
    .from('programari_leads')
    .select(PROGRAMARI_SALA_SELECT)
    .eq('data_programarii', date)
  if (locatieId) progQ = progQ.eq('locatie', locatieId)
  const [inc, prog] = await Promise.all([incQ, progQ])
  if (inc.error) throw inc.error
  if (prog.error) throw prog.error

  const incRows = (inc.data ?? []) as unknown as (IncasareSalaRefs & {
    suma: number | null
  })[]
  const progRows = (prog.data ?? []) as unknown as ProgramareSalaRefs[]

  const incasariAzi = incRows
    .filter((r) => incasareInSali(sali, r))
    .reduce((acc, r) => acc + Number(r.suma ?? 0), 0)
  return {
    incasariAzi,
    programariAzi: progRows.filter((r) => programareInSali(sali, r)).length,
  }
}
