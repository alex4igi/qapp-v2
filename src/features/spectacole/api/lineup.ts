import { supabase } from '@/lib/supabase'
import type { InsertDto, SpectacolAct, UpdateDto } from '@/types/db'

export type ActPerformer = {
  // id-ul rândului din spectacol_act_performeri (folosit la ștergere)
  id: string
  client: string
  nume: string
  prenume: string | null
}

export type ActCuPerformeri = SpectacolAct & {
  cursNume: string | null
  responsabilNume: string | null
  performeri: ActPerformer[]
}

// Lineup-ul complet al unui spectacol: actele ordonate + performerii fiecăruia.
export async function getLineup(spectacolId: string): Promise<ActCuPerformeri[]> {
  const { data: acteData, error: acteErr } = await supabase
    .from('spectacol_acte')
    .select(
      'id, spectacol, ordine, titlu, curs, durata_min, responsabil, note, created, ' +
        'curs_rel:cursuri(numele), responsabil_rel:teacheri(nume, prenume)',
    )
    .eq('spectacol', spectacolId)
    .order('ordine', { ascending: true })
  if (acteErr) throw acteErr

  const acte = (acteData ?? []) as unknown as Array<
    SpectacolAct & {
      curs_rel: { numele: string } | null
      responsabil_rel: { nume: string; prenume: string | null } | null
    }
  >
  const actIds = acte.map((a) => a.id)

  const perfByAct = new Map<string, ActPerformer[]>()
  if (actIds.length) {
    const { data: perfData, error: perfErr } = await supabase
      .from('spectacol_act_performeri')
      .select('id, act, client, client_rel:clienti(nume, prenume)')
      .in('act', actIds)
    if (perfErr) throw perfErr
    for (const p of (perfData ?? []) as unknown as Array<{
      id: string
      act: string
      client: string
      client_rel: { nume: string; prenume: string | null } | null
    }>) {
      const list = perfByAct.get(p.act) ?? []
      list.push({
        id: p.id,
        client: p.client,
        nume: p.client_rel?.nume ?? '—',
        prenume: p.client_rel?.prenume ?? null,
      })
      perfByAct.set(p.act, list)
    }
  }

  return acte.map((a) => ({
    ...a,
    cursNume: a.curs_rel?.numele ?? null,
    responsabilNume: a.responsabil_rel
      ? `${a.responsabil_rel.nume} ${a.responsabil_rel.prenume ?? ''}`.trim()
      : null,
    performeri: (perfByAct.get(a.id) ?? []).sort((x, y) =>
      x.nume.localeCompare(y.nume),
    ),
  }))
}

export async function createAct(dto: InsertDto<'spectacol_acte'>): Promise<SpectacolAct> {
  const { data, error } = await supabase
    .from('spectacol_acte')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateAct(
  id: string,
  dto: UpdateDto<'spectacol_acte'>,
): Promise<SpectacolAct> {
  const { data, error } = await supabase
    .from('spectacol_acte')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteAct(id: string): Promise<void> {
  const { error } = await supabase.from('spectacol_acte').delete().eq('id', id)
  if (error) throw error
}

// Persistă noua ordine a actelor după drag-and-drop. `orderedIds` = ordinea dorită.
export async function reorderActe(orderedIds: string[]): Promise<void> {
  // Update secvențial: câteva acte per spectacol, nu justifică un RPC batch.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('spectacol_acte')
      .update({ ordine: i })
      .eq('id', orderedIds[i])
    if (error) throw error
  }
}

export async function addPerformer(
  actId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase
    .from('spectacol_act_performeri')
    .insert({ act: actId, client: clientId })
  if (error) throw error
}

export async function removePerformer(performerId: string): Promise<void> {
  const { error } = await supabase
    .from('spectacol_act_performeri')
    .delete()
    .eq('id', performerId)
  if (error) throw error
}

// Pre-populează performerii unui act din roster-ul activ al unei grupe/trupe.
// Apartenența = înrolare NEreziliată (semnalul de încredere; vezi grupa.ts). Dedup
// pe client; `onConflict ignoreDuplicates` face operația re-rulabilă fără dubluri.
export async function seedPerformeriDinCurs(
  actId: string,
  cursId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('client')
    .eq('cursul', cursId)
    .eq('reziliat', false)
  if (error) throw error

  const clientIds = Array.from(
    new Set(
      ((data ?? []) as Array<{ client: string | null }>)
        .map((r) => r.client)
        .filter((c): c is string => Boolean(c)),
    ),
  )
  if (!clientIds.length) return 0

  const { error: insErr } = await supabase
    .from('spectacol_act_performeri')
    .upsert(
      clientIds.map((client) => ({ act: actId, client })),
      { onConflict: 'act,client', ignoreDuplicates: true },
    )
  if (insErr) throw insErr
  return clientIds.length
}
