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

// Inserează una sau mai multe încasări într-o singură cerere (ex: plată mixtă
// Cash + Card → un rând per metodă, cu aceleași date de context).
export async function createIncasari(
  dtos: InsertDto<'incasari'>[],
): Promise<Incasare[]> {
  const { data, error } = await supabase
    .from('incasari')
    .insert(dtos)
    .select('*')
  if (error) throw error
  return data ?? []
}

export type Tender = { metoda: Enums<'metoda_plata'>; suma: number }

const round2 = (n: number) => Math.round(n * 100) / 100

// Creează una sau mai multe încasări pentru un set de înrolări selectate,
// distribuind suma FIFO peste rândurile vechi → noi. Dacă `tenders` e dat
// (plată mixtă Cash + Card), fiecare porție FIFO se taie suplimentar pe metode
// în ordinea tenders → un rând per (înrolare × metodă).
export async function registerPlataFifo(params: {
  clientId: string // toate înrolările aparțin aceluiași client
  enrollmentIds: string[] // în ordine vechi → nou
  remaining: number[] // rest per enrollment, în aceeași ordine
  partialAmount: number | null // dacă null, plătim restul fiecăruia integral
  metoda: Enums<'metoda_plata'>
  tenders?: Tender[] | null // dacă dat, înlocuiește `metoda`; sum(tenders) = pool
  data: string // YYYY-MM-DD
  locatieId: string // locația de unde se face plata
}): Promise<Incasare[]> {
  // 1) distribuie pool-ul FIFO în porții (fără metodă încă)
  const portions: { inregistrare: string; suma: number }[] = []
  let pool =
    params.partialAmount != null
      ? params.partialAmount
      : params.remaining.reduce((a, b) => a + b, 0)

  for (let i = 0; i < params.enrollmentIds.length; i++) {
    const owe = params.remaining[i]
    if (owe <= 0) continue
    const pay = Math.min(owe, pool)
    if (pay <= 0) break
    portions.push({ inregistrare: params.enrollmentIds[i], suma: round2(pay) })
    pool -= pay
    if (pool <= 0) break
  }
  if (portions.length === 0) return []

  // 2) secvența de metode: tenders explicite SAU o singură metodă pe tot pool-ul
  const tenders: Tender[] =
    params.tenders && params.tenders.length > 0
      ? params.tenders
      : [
          {
            metoda: params.metoda,
            suma: portions.reduce((a, p) => a + p.suma, 0),
          },
        ]

  // 3) taie fiecare porție pe metode, consumând tenders în ordine
  const mk = (inregistrare: string, suma: number, metoda: Enums<'metoda_plata'>): InsertDto<'incasari'> => ({
    client: params.clientId,
    inregistrare,
    data: params.data,
    suma: round2(suma),
    metoda,
    categorie: 'Abonament',
    locatie: params.locatieId,
  })

  const inserts: InsertDto<'incasari'>[] = []
  let ti = 0
  let tRem = tenders[0].suma
  for (const p of portions) {
    let need = p.suma
    while (need > 0.004) {
      if (tRem <= 0.004) {
        if (ti < tenders.length - 1) {
          ti++
          tRem = tenders[ti].suma
          continue
        }
        // tenders subfinanțate (rounding) — restul pe ultima metodă
        inserts.push(mk(p.inregistrare, need, tenders[ti].metoda))
        need = 0
        break
      }
      const take = Math.min(need, tRem)
      inserts.push(mk(p.inregistrare, take, tenders[ti].metoda))
      need = round2(need - take)
      tRem = round2(tRem - take)
    }
  }

  const { data, error } = await supabase
    .from('incasari')
    .insert(inserts)
    .select('*')
  if (error) throw error
  return data ?? []
}

// ── Plata integrală a sezonului (−5%, Anexa 1 din contract) ──────────────────────
// Regula (eligibilitate + prețuri) trăiește în DB, în `_plan_plata_integrala`, și e
// aceeași pentru portal și pentru ghișeu. Aici doar întrebăm și încasăm: suma NU se
// trimite de la client, o recalculează RPC-ul.

export type PlanIntegralRata = { enrollment_id: string; pay: number }

export type PlanIntegral =
  | { eligibil: false; motiv: string }
  | {
      eligibil: true
      sezon_id: string
      sezon_nume: string
      scadenta: string
      luni: number
      total_curent: number
      total_plata: number
      discount: number
      plan: PlanIntegralRata[]
    }

export async function getPlanPlataIntegrala(clientId: string): Promise<PlanIntegral> {
  const { data, error } = await supabase.rpc('plan_plata_integrala_staff', {
    p_client: clientId,
  })
  if (error) throw error
  return data as unknown as PlanIntegral
}

export async function incaseazaPlataIntegrala(params: {
  clientId: string
  tenders: Tender[]
  data: string
  locatieId: string
}): Promise<{ rate: number; total_platit: number; discount: number; sezon: string }> {
  const { data, error } = await supabase.rpc('incaseaza_plata_integrala_sezon', {
    p_client: params.clientId,
    p_tenders: params.tenders as unknown as never,
    p_data: params.data,
    p_locatie: params.locatieId,
  })
  if (error) throw error
  return data as unknown as {
    rate: number
    total_platit: number
    discount: number
    sezon: string
  }
}
