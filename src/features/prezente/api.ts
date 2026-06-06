import { supabase } from '@/lib/supabase'
import type { Prezenta, StatusPrezenta } from '@/types/db'

export type RosterRow = {
  enrollmentId: string
  clientId: string
  nume: string
  prenume: string | null
}

function toRosterRows(
  rows: Array<{
    id: string
    client: { id: string; nume: string; prenume: string | null } | null
  }>,
): RosterRow[] {
  return rows
    .filter((r) => r.client)
    .map((r) => ({
      enrollmentId: r.id,
      clientId: r.client!.id,
      nume: r.client!.nume,
      prenume: r.client!.prenume,
    }))
    .sort((a, b) => a.nume.localeCompare(b.nume))
}

// Roster-ul unui curs pentru marcarea prezenței. Pentru cursurile FACULTATIVE
// (open class) cu o dată dată, roster-ul e specific sesiunii: cei care au rezervat
// ședința aceea (open_rezervari) + abonații „Per lună" care acoperă data. Altfel
// (recurent, sau facultativ fără dată) → toate înrolările active.
export async function getCursRoster(
  cursId: string,
  data?: string,
): Promise<RosterRow[]> {
  if (data) {
    const { data: curs, error: cErr } = await supabase
      .from('cursuri')
      .select('facultativ')
      .eq('id', cursId)
      .single()
    if (cErr) throw cErr
    if (curs.facultativ) return getOpenRosterForDate(cursId, data)
  }

  const { data: rows, error } = await supabase
    .from('enrollments')
    .select('id, client(id, nume, prenume)')
    .eq('cursul', cursId)
    .eq('activ', true)
  if (error) throw error
  return toRosterRows(
    (rows ?? []) as unknown as Parameters<typeof toRosterRows>[0],
  )
}

// Roster pentru o sesiune OPEN la o dată: rezervări vii (mapate la enrollment) +
// abonați facultativi „Per lună" activi care acoperă data.
export async function getOpenRosterForDate(
  cursId: string,
  data: string,
): Promise<RosterRow[]> {
  const byEnrollment = new Map<string, RosterRow>()

  const { data: sesiune, error: sErr } = await supabase
    .from('open_sesiuni')
    .select('id')
    .eq('curs', cursId)
    .eq('data', data)
    .maybeSingle()
  if (sErr) throw sErr

  if (sesiune) {
    const { data: rez, error: rErr } = await supabase
      .from('open_rezervari')
      .select('enrollment, client:clienti(id, nume, prenume)')
      .eq('sesiune', sesiune.id)
      .neq('status', 'anulat')
    if (rErr) throw rErr
    for (const r of (rez ?? []) as unknown as Array<{
      enrollment: string | null
      client: { id: string; nume: string; prenume: string | null } | null
    }>) {
      if (r.enrollment && r.client) {
        byEnrollment.set(r.enrollment, {
          enrollmentId: r.enrollment,
          clientId: r.client.id,
          nume: r.client.nume,
          prenume: r.client.prenume,
        })
      }
    }
  }

  // Abonați „Per lună" facultativi care acoperă data (acces nelimitat în lună).
  const { data: lunari, error: lErr } = await supabase
    .from('enrollments')
    .select('id, client:clienti(id, nume, prenume)')
    .eq('cursul', cursId)
    .eq('activ', true)
    .eq('reziliat', false)
    .eq('tip_plata', 'Per luna')
    .lte('data_incepere', data)
    .gte('data_final', data)
  if (lErr) throw lErr
  for (const e of (lunari ?? []) as unknown as Array<{
    id: string
    client: { id: string; nume: string; prenume: string | null } | null
  }>) {
    if (e.client && !byEnrollment.has(e.id)) {
      byEnrollment.set(e.id, {
        enrollmentId: e.id,
        clientId: e.client.id,
        nume: e.client.nume,
        prenume: e.client.prenume,
      })
    }
  }

  return Array.from(byEnrollment.values()).sort((a, b) =>
    a.nume.localeCompare(b.nume),
  )
}

export async function getPrezente(
  enrollmentIds: string[],
  data: string,
): Promise<Prezenta[]> {
  if (enrollmentIds.length === 0) return []
  const { data: rows, error } = await supabase
    .from('prezente')
    .select('*')
    .in('enrollment', enrollmentIds)
    .eq('data', data)
  if (error) throw error
  return rows ?? []
}

export async function upsertPrezenta(params: {
  enrollmentId: string
  clientId: string
  data: string
  status: StatusPrezenta
}): Promise<void> {
  const { error } = await supabase.from('prezente').upsert(
    {
      enrollment: params.enrollmentId,
      client: params.clientId,
      data: params.data,
      status: params.status,
    },
    { onConflict: 'enrollment,data' },
  )
  if (error) throw error
}
