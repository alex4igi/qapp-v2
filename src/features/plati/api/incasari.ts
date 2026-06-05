import { supabase } from '@/lib/supabase'
import { normalizeTelefon } from '@/lib/phone'
import type { Enums, Incasare, InsertDto } from '@/types/db'

export async function getEnrollmentIncasari(
  enrollmentId: string,
): Promise<Incasare[]> {
  const { data, error } = await supabase
    .from('incasari')
    .select('*')
    .eq('inregistrare', enrollmentId)
    .order('data', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// Rezolvă persoana pentru un guest de workshop (nume + telefon), evitând dubluri:
//   1. dacă există deja un client cu acest telefon → atașăm încasarea la client
//   2. dacă există deja un lead cu acest telefon → îl reutilizăm
//   3. altfel creăm un lead minimal în Nurture (FĂRĂ SMS de bun-venit)
export type WorkshopGuestResult =
  | { kind: 'client'; clientId: string }
  | { kind: 'lead'; leadId: string }

export async function resolveWorkshopGuest(input: {
  nume: string
  telefon: string
  evenimentNume?: string | null
}): Promise<WorkshopGuestResult> {
  const telefon = normalizeTelefon(input.telefon)

  const { data: client } = await supabase
    .from('clienti')
    .select('id')
    .eq('telefon', telefon)
    .limit(1)
    .maybeSingle()
  if (client) return { kind: 'client', clientId: client.id }

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('telefon', telefon)
    .limit(1)
    .maybeSingle()
  if (lead) return { kind: 'lead', leadId: lead.id }

  const observatii = input.evenimentNume
    ? `Workshop: ${input.evenimentNume}`
    : 'Workshop'
  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      nume: input.nume.trim(),
      telefon,
      status: 'nurture',
      observatii,
    })
    .select('id')
    .single()
  if (error) throw error
  return { kind: 'lead', leadId: created.id }
}

export async function createIncasare(
  dto: InsertDto<'incasari'>,
): Promise<Incasare> {
  const { data, error } = await supabase
    .from('incasari')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Creează una sau mai multe încasări pentru un set de înrolări selectate,
// distribuind suma FIFO peste rândurile vechi → noi.
export async function registerPlataFifo(params: {
  enrollmentIds: string[] // în ordine vechi → nou
  remaining: number[] // rest per enrollment, în aceeași ordine
  partialAmount: number | null // dacă null, plătim restul fiecăruia integral
  metoda: Enums<'metoda_plata'>
  data: string // YYYY-MM-DD
  locatieId: string // locația de unde se face plata
}): Promise<Incasare[]> {
  const inserts: InsertDto<'incasari'>[] = []
  let pool =
    params.partialAmount != null
      ? params.partialAmount
      : params.remaining.reduce((a, b) => a + b, 0)

  for (let i = 0; i < params.enrollmentIds.length; i++) {
    const owe = params.remaining[i]
    if (owe <= 0) continue
    const pay = Math.min(owe, pool)
    if (pay <= 0) break
    inserts.push({
      inregistrare: params.enrollmentIds[i],
      data: params.data,
      suma: pay,
      metoda: params.metoda,
      categorie: 'Abonament',
      locatie: params.locatieId,
    })
    pool -= pay
    if (pool <= 0) break
  }
  if (inserts.length === 0) return []

  const { data, error } = await supabase
    .from('incasari')
    .insert(inserts)
    .select('*')
  if (error) throw error
  return data ?? []
}
