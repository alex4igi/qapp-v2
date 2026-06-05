import { supabase } from '@/lib/supabase'
import type { ReconciliereCash, InsertDto } from '@/types/db'

export type IncasareRow = {
  id: string
  suma: number
  metoda: string | null
  observatii: string | null
  categorie: string | null
  bucati: number | null
  data: string | null
  client_nume: string | null
  detalii: string | null
  locatie_id: string | null
  locatie_nume: string | null
}

export type SumarZi = {
  total: number
  cash: number
  card: number
  transfer: number
  revolut: number
}

export type DenominatiiMap = Record<string, number>

export const DENOMINATII = [500, 200, 100, 50, 20, 10, 5, 1] as const

export function totalDinDenominatii(d: DenominatiiMap): number {
  return Object.entries(d).reduce(
    (acc, [v, n]) => acc + Number(v) * Number(n || 0),
    0,
  )
}

export async function getIncasariZi(
  data: string,
  locatieId: string | null,
): Promise<IncasareRow[]> {
  let q = supabase
    .from('incasari')
    .select(
      `
      id, suma, metoda, observatii, categorie, bucati, data, created, locatie,
      clienti(nume, prenume),
      enrollments(cursuri(numele)),
      inventar(articol),
      locatii(id, nume)
      `,
    )
    .eq('data', data)
    .order('created', { ascending: true })

  if (locatieId) q = q.eq('locatie', locatieId)

  const { data: rows, error } = await q
  if (error) throw error

  type RawRow = {
    id: string
    suma: number | null
    metoda: string | null
    observatii: string | null
    categorie: string | null
    bucati: number | null
    data: string | null
    locatie: string | null
    clienti: { nume: string | null; prenume: string | null } | null
    enrollments: { cursuri: { numele: string | null } | null } | null
    inventar: { articol: string | null } | null
    locatii: { id: string; nume: string | null } | null
  }

  return (rows as unknown as RawRow[] | null ?? []).map((r) => ({
    id: r.id,
    suma: Number(r.suma ?? 0),
    metoda: r.metoda,
    observatii: r.observatii,
    categorie: r.categorie,
    bucati: r.bucati,
    data: r.data,
    client_nume: r.clienti
      ? `${r.clienti.nume ?? ''} ${r.clienti.prenume ?? ''}`.trim() || null
      : null,
    detalii:
      r.categorie === 'Abonament'
        ? (r.enrollments?.cursuri?.numele ?? null)
        : r.categorie === 'Merch'
          ? (r.inventar?.articol ?? null)
          : null,
    locatie_id: r.locatie ?? null,
    locatie_nume: r.locatii?.nume ?? null,
  }))
}

export function sumarFromRows(rows: IncasareRow[]): SumarZi {
  const sumByMetoda = (m: string) =>
    rows.filter((r) => r.metoda === m).reduce((a, r) => a + r.suma, 0)
  return {
    total: rows.reduce((a, r) => a + r.suma, 0),
    cash: sumByMetoda('Cash'),
    card: sumByMetoda('Card'),
    transfer: sumByMetoda('Transfer'),
    revolut: sumByMetoda('Revolut'),
  }
}

export async function getReconciliereZi(
  data: string,
  locatieId: string,
): Promise<ReconciliereCash | null> {
  const { data: row, error } = await supabase
    .from('reconcilieri_cash')
    .select('*')
    .eq('data', data)
    .eq('locatie', locatieId)
    .maybeSingle()
  if (error) throw error
  return row
}

export async function getFondAnterior(
  data: string,
  locatieId: string,
): Promise<number> {
  const { data: row, error } = await supabase
    .from('reconcilieri_cash')
    .select('fond_ramas')
    .eq('locatie', locatieId)
    .lt('data', data)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Number(row?.fond_ramas ?? 0)
}

export async function upsertReconciliere(
  record: InsertDto<'reconcilieri_cash'>,
): Promise<ReconciliereCash> {
  const { data, error } = await supabase
    .from('reconcilieri_cash')
    .upsert(record, { onConflict: 'data,locatie' })
    .select('*')
    .single()
  if (error) throw error
  return data
}
