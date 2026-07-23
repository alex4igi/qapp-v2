import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import { applyWordSearch } from '@/lib/search'
import { fetchAllRows } from '@/lib/fetchAll'
import { formatDate } from '@/lib/format'
import type { Enums } from '@/types/db'

export const PAGE_SIZE = 25

// Embed-ul de închiriere pe încasare (categoria „Inchiriere"): sala + interval + chiriaș.
const INCHIRIERE_EMBED = `inchirieri(data, ora_start, ora_final, guest_nume,
        sala_rel:sali(nume),
        teacher_rel:teacheri(nume, prenume),
        client_rel:clienti(nume, prenume))`

type InchiriereEmbed = {
  data: string | null
  ora_start: string | null
  ora_final: string | null
  guest_nume: string | null
  sala_rel: { nume: string | null } | null
  teacher_rel: { nume: string | null; prenume: string | null } | null
  client_rel: { nume: string | null; prenume: string | null } | null
} | null

const fullName = (p: { nume: string | null; prenume: string | null } | null) =>
  p ? `${p.nume ?? ''} ${p.prenume ?? ''}`.trim() || null : null

// Detaliul afișat pentru o încasare de închiriere. Citit din rândul de închiriere,
// nu din `observatii`: descrierea e înghețată la încasare și nu urmărește mutările
// de interval/sală făcute ulterior.
function inchiriereDetalii(r: InchiriereEmbed): string | null {
  if (!r) return null
  const renter =
    fullName(r.teacher_rel) ?? fullName(r.client_rel) ?? r.guest_nume ?? null
  const interval = [r.ora_start, r.ora_final]
    .filter(Boolean)
    .map((t) => (t as string).slice(0, 5))
    .join('–')
  const cand = [r.data ? formatDate(r.data) : null, interval || null]
    .filter(Boolean)
    .join(' ')
  return (
    [r.sala_rel?.nume, cand || null, renter].filter(Boolean).join(' · ') || null
  )
}

// ---------------------------------------------------------------------
// Ștergere / modificare încasare (manager+/admin/owner) — cu motiv + audit
// ---------------------------------------------------------------------

export type IncasareEditable = {
  id: string
  data: string | null
  suma: number | null
  metoda: string | null
  observatii: string | null
  categorie: string | null
  locatie: string | null
  client_nume: string | null
  detalii: string | null
}

export async function getIncasareForEdit(id: string): Promise<IncasareEditable> {
  const { data, error } = await supabase
    .from('incasari')
    .select(
      `
      id, data, suma, metoda, observatii, categorie, locatie,
      clienti(nume, prenume),
      enrollments(cursuri(numele)),
      inventar(articol),
      ${INCHIRIERE_EMBED}
      `,
    )
    .eq('id', id)
    .single()
  if (error) throw error
  const r = data as unknown as {
    id: string
    data: string | null
    suma: number | null
    metoda: string | null
    observatii: string | null
    categorie: string | null
    locatie: string | null
    clienti: { nume: string | null; prenume: string | null } | null
    enrollments: { cursuri: { numele: string | null } | null } | null
    inventar: { articol: string | null } | null
    inchirieri: InchiriereEmbed
  }
  return {
    id: r.id,
    data: r.data,
    suma: r.suma,
    metoda: r.metoda,
    observatii: r.observatii,
    categorie: r.categorie,
    locatie: r.locatie,
    client_nume: r.clienti
      ? `${r.clienti.nume ?? ''} ${r.clienti.prenume ?? ''}`.trim() || null
      : null,
    detalii:
      r.categorie === 'Abonament'
        ? (r.enrollments?.cursuri?.numele ?? null)
        : r.categorie === 'Merch'
          ? (r.inventar?.articol ?? null)
          : r.categorie === 'Inchiriere'
            ? inchiriereDetalii(r.inchirieri)
            : null,
  }
}

export async function updateIncasareWithAudit(params: {
  id: string
  patch: { data?: string | null; suma?: number; metoda?: string | null; observatii?: string | null }
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const cur = await getIncasareForEdit(params.id)
  const next = {
    data: params.patch.data ?? cur.data,
    suma: params.patch.suma ?? cur.suma,
    metoda: params.patch.metoda ?? cur.metoda,
    observatii: params.patch.observatii ?? cur.observatii,
  }

  const { error: uErr } = await supabase
    .from('incasari')
    .update({
      data: next.data,
      suma: next.suma,
      metoda: next.metoda as Enums<'metoda_plata'> | null,
      observatii: next.observatii,
      updated: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (uErr) throw uErr

  await recordAuditLog({
    action: 'incasare_modified',
    entityType: 'incasare',
    entityId: params.id,
    oldValue: {
      data: cur.data,
      suma: cur.suma,
      metoda: cur.metoda,
      observatii: cur.observatii,
    },
    newValue: next,
    reason: motiv,
    locatieId: cur.locatie,
  })
}

export async function deleteIncasareWithAudit(params: {
  id: string
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const cur = await getIncasareForEdit(params.id)

  const { error: dErr } = await supabase.from('incasari').delete().eq('id', params.id)
  if (dErr) throw dErr

  await recordAuditLog({
    action: 'incasare_deleted',
    entityType: 'incasare',
    entityId: params.id,
    oldValue: {
      data: cur.data,
      suma: cur.suma,
      metoda: cur.metoda,
      categorie: cur.categorie,
      client: cur.client_nume,
      detalii: cur.detalii,
    },
    newValue: null,
    reason: motiv,
    locatieId: cur.locatie,
  })
}

export type IncasareRow = {
  id: string
  data: string | null
  suma: number
  metoda: string | null
  observatii: string | null
  categorie: string | null
  bucati: number | null
  client_nume: string | null
  detalii: string | null
  locatie_nume: string | null
}

export type IncasariListParams = {
  search: string
  page: number
  from: string
  to: string
  locatieId: string | null
  categorie: string | null
}

export type IncasariListResult = {
  rows: IncasareRow[]
  total: number
}

const INCASARI_SELECT = `
      id, data, suma, metoda, observatii, categorie, bucati,
      clienti(nume, prenume),
      enrollments(cursuri(numele)),
      inventar(articol),
      locatii(nume),
      ${INCHIRIERE_EMBED}
      `

type IncasareRaw = {
  id: string
  data: string | null
  suma: number | null
  metoda: string | null
  observatii: string | null
  categorie: string | null
  bucati: number | null
  clienti: { nume: string | null; prenume: string | null } | null
  enrollments: { cursuri: { numele: string | null } | null } | null
  inventar: { articol: string | null } | null
  locatii: { nume: string | null } | null
  inchirieri: InchiriereEmbed
}

function mapIncasareRow(r: IncasareRaw): IncasareRow {
  return {
    id: r.id,
    data: r.data,
    suma: Number(r.suma ?? 0),
    metoda: r.metoda,
    observatii: r.observatii,
    categorie: r.categorie,
    bucati: r.bucati,
    client_nume: r.clienti
      ? `${r.clienti.nume ?? ''} ${r.clienti.prenume ?? ''}`.trim() || null
      : null,
    detalii:
      r.categorie === 'Abonament'
        ? (r.enrollments?.cursuri?.numele ?? null)
        : r.categorie === 'Merch'
          ? (r.inventar?.articol ?? null)
          : r.categorie === 'Inchiriere'
            ? inchiriereDetalii(r.inchirieri)
            : null,
    locatie_nume: r.locatii?.nume ?? null,
  }
}

export async function listIncasari({
  search,
  page,
  from,
  to,
  locatieId,
  categorie,
}: IncasariListParams): Promise<IncasariListResult> {
  const rangeFrom = page * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  let query = supabase
    .from('incasari')
    .select(INCASARI_SELECT, { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(rangeFrom, rangeTo)

  if (from) query = query.gte('data', from)
  if (to) query = query.lte('data', to)
  if (locatieId) query = query.eq('locatie', locatieId)
  if (categorie)
    query = query.eq('categorie', categorie as Enums<'categorie_incasare'>)

  query = applyWordSearch(query, search, ['observatii'])

  const { data, error, count } = await query
  if (error) throw error

  const rows = (data as unknown as IncasareRaw[] | null ?? []).map(
    mapIncasareRow,
  )

  return { rows, total: count ?? 0 }
}

// Export: toate încasările filtrate (fără paginare) pentru CSV cu total real.
export async function exportIncasari(
  params: Omit<IncasariListParams, 'page'>,
): Promise<IncasareRow[]> {
  // Paginat: peste max_rows (1000) exportul ar fi tăiat silențios.
  const data = await fetchAllRows(() => {
    let query = supabase
      .from('incasari')
      .select(INCASARI_SELECT)
      .order('data', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })

    if (params.from) query = query.gte('data', params.from)
    if (params.to) query = query.lte('data', params.to)
    if (params.locatieId) query = query.eq('locatie', params.locatieId)
    if (params.categorie)
      query = query.eq(
        'categorie',
        params.categorie as Enums<'categorie_incasare'>,
      )

    return applyWordSearch(query, params.search, ['observatii'])
  })
  return (data as unknown as IncasareRaw[]).map(mapIncasareRow)
}
