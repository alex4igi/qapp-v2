import { supabase } from '@/lib/supabase'
import { getCursDatorii } from '@/features/cursuri/api'

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
): Promise<IncasareAziRow[]> {
  let q = supabase
    .from('incasari')
    .select('id, suma, metoda, clienti(nume, prenume)')
    .eq('data', date)
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q.order('suma', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string
      suma: number | null
      metoda: string | null
      clienti: { nume: string | null; prenume: string | null } | null
    }
    return {
      id: row.id,
      nume: personName(row.clienti),
      suma: Number(row.suma ?? 0),
      metoda: row.metoda,
    }
  })
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
): Promise<ProgramareAziRow[]> {
  let q = supabase
    .from('programari_leads')
    .select('id, cursul_programat, lead:leads(nume, prenume)')
    .eq('data_programarii', date)
  if (locatieId) q = q.eq('locatie', locatieId)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    cursul_programat: string | null
    lead: { nume: string | null; prenume: string | null } | null
  }>
  const cursIds = [...new Set(rows.map((r) => r.cursul_programat).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (cursIds.length) {
    const { data: cs } = await supabase
      .from('cursuri')
      .select('id, numele')
      .in('id', cursIds)
    for (const c of cs ?? []) names.set(c.id, c.numele)
  }
  return rows.map((r) => ({
    id: r.id,
    nume: personName(r.lead),
    grupa: (r.cursul_programat && names.get(r.cursul_programat)) || '—',
  }))
}

export type RestantierAziRow = {
  clientId: string
  nume: string
  grupa: string
  rest: number
}

// Restanțieri pe grupele de azi: cine · grupă · cât. Agregă getCursDatorii peste
// cursurile zilei (puține → câteva query-uri), pe sezonul curent.
export async function getRestantieriAzi(
  courses: { id: string; numele: string }[],
  sezonStart: string,
  sezonEnd: string,
): Promise<RestantierAziRow[]> {
  const perCurs = await Promise.all(
    courses.map(async (c) => {
      const datorii = await getCursDatorii({
        cursId: c.id,
        sezonStart,
        sezonEnd,
      })
      return datorii.map((d) => ({
        clientId: d.clientId,
        nume: `${d.nume} ${d.prenume ?? ''}`.trim() || '—',
        grupa: c.numele,
        rest: d.rest,
      }))
    }),
  )
  return perCurs.flat().sort((a, b) => b.rest - a.rest)
}
