import { supabase } from '@/lib/supabase'
import { getCursuriDatorii } from '@/features/cursuri/api'
import {
  INCASARI_SALA_SELECT,
  PROGRAMARI_SALA_SELECT,
  incasareInSali,
  programareInSali,
  type IncasareSalaRefs,
  type ProgramareSalaRefs,
  type SalaFilter,
} from './salaFilter'

// Preview-uri pentru KPI-urile zilei (afișate la deschiderea cardului).
// Liste scurte, lazy — interogate doar când userul deschide cardul.

function personName(p: { nume: string | null; prenume: string | null } | null): string {
  if (!p) return '—'
  return `${p.nume ?? ''} ${p.prenume ?? ''}`.trim() || '—'
}

export type IncasareAziRow = {
  id: string
  nume: string
  suma: number
  metoda: string | null
}

// Plăți de azi: cine · cât · cum.
export async function getIncasariAzi(
  date: string,
  locatieId?: string | null,
  sali: SalaFilter | null = null,
): Promise<IncasareAziRow[]> {
  let q = supabase
    .from('incasari')
    .select(`id, suma, metoda, clienti(nume, prenume), ${INCASARI_SALA_SELECT}`)
    .eq('data', date)
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q.order('suma', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as (IncasareSalaRefs & {
    id: string
    suma: number | null
    metoda: string | null
    clienti: { nume: string | null; prenume: string | null } | null
  })[]
  return rows
    .filter((r) => incasareInSali(sali, r))
    .map((row) => ({
      id: row.id,
      nume: personName(row.clienti),
      suma: Number(row.suma ?? 0),
      metoda: row.metoda,
    }))
}

export type ProgramareAziRow = {
  id: string
  nume: string
  grupa: string
}

// Programări lead de azi: cine · grupă.
export async function getProgramariAzi(
  date: string,
  locatieId?: string | null,
  sali: SalaFilter | null = null,
): Promise<ProgramareAziRow[]> {
  let q = supabase
    .from('programari_leads')
    .select(
      `id, cursul_programat, eveniment_programat, lead:leads(nume, prenume), ${PROGRAMARI_SALA_SELECT}`,
    )
    .eq('data_programarii', date)
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q
  if (error) throw error
  const rows = ((data ?? []) as unknown as Array<
    ProgramareSalaRefs & {
      id: string
      cursul_programat: string | null
      eveniment_programat: string | null
      lead: { nume: string | null; prenume: string | null } | null
    }
  >).filter((r) => programareInSali(sali, r))
  const cursIds = [...new Set(rows.map((r) => r.cursul_programat).filter(Boolean))] as string[]
  // Programările pe clase demo n-au curs — numele vine din eveniment, altfel
  // toată săptămâna demo apărea ca „—" în agenda zilei.
  const evIds = [...new Set(rows.map((r) => r.eveniment_programat).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  const evNames = new Map<string, string>()
  const [cs, evs] = await Promise.all([
    cursIds.length
      ? supabase.from('cursuri').select('id, numele').in('id', cursIds)
      : Promise.resolve({ data: [] as { id: string; numele: string }[] }),
    evIds.length
      ? supabase.from('evenimente').select('id, nume_eveniment').in('id', evIds)
      : Promise.resolve({ data: [] as { id: string; nume_eveniment: string }[] }),
  ])
  for (const c of cs.data ?? []) names.set(c.id, c.numele)
  for (const e of evs.data ?? []) evNames.set(e.id, e.nume_eveniment)
  return rows.map((r) => ({
    id: r.id,
    nume: personName(r.lead),
    grupa:
      (r.cursul_programat && names.get(r.cursul_programat)) ||
      (r.eveniment_programat && evNames.get(r.eveniment_programat)) ||
      '—',
  }))
}

export type RestantierAziRow = {
  clientId: string
  nume: string
  grupa: string
  rest: number
}

// Restanțieri pe grupele de azi: cine · grupă · cât. O singură cerere pentru toate
// cursurile zilei (getCursuriDatorii), pe sezonul curent — înainte erau N cereri
// paralele pe view-ul greu, câte una per grupă.
export async function getRestantieriAzi(
  courses: { id: string; numele: string }[],
  sezonStart: string,
  sezonEnd: string,
): Promise<RestantierAziRow[]> {
  const byCurs = await getCursuriDatorii({
    cursIds: courses.map((c) => c.id),
    sezonStart,
    sezonEnd,
  })
  return courses
    .flatMap((c) =>
      (byCurs.get(c.id) ?? []).map((d) => ({
        clientId: d.clientId,
        nume: `${d.nume} ${d.prenume ?? ''}`.trim() || '—',
        grupa: c.numele,
        rest: d.rest,
      })),
    )
    .sort((a, b) => b.rest - a.rest)
}
