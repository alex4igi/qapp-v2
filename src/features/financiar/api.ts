import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import type { Enums, Views } from '@/types/db'

export type StatLunara = Views<'statistica_restante_totale'>
export type RestantaTeacher = Views<'restante_teacher_luna'>
export type RestantaLocatie = Views<'restante_locatie_luna'>

export async function getStatisticaLunara(): Promise<StatLunara[]> {
  const { data, error } = await supabase
    .from('statistica_restante_totale')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getRestanteTeacher(): Promise<RestantaTeacher[]> {
  const { data, error } = await supabase
    .from('restante_teacher_luna')
    .select('*')
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getRestanteLocatie(): Promise<RestantaLocatie[]> {
  const { data, error } = await supabase
    .from('restante_locatie_luna')
    .select('*')
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

export const PAGE_SIZE = 25

export type RaportDimensiune = 'all' | 'locatie' | 'sala' | 'curs' | 'teacher'

export const RAPORT_DIMENSIUNI: { value: RaportDimensiune; label: string }[] = [
  { value: 'all',     label: 'Toate locațiile' },
  { value: 'locatie', label: 'Per locație' },
  { value: 'sala',    label: 'Per sală' },
  { value: 'curs',    label: 'Per curs' },
  { value: 'teacher', label: 'Per profesor' },
]

export type RaportZiRow = {
  data: string
  total: number
  cash: number
  card: number
  transfer: number
  revolut: number
}

export type RaportZileResult = {
  rows: RaportZiRow[]
  summary: RaportZiRow
}

export async function getRaportZile(params: {
  from: string
  to: string
  dimensiune: RaportDimensiune
  entityId: string
}): Promise<RaportZileResult> {
  let q = supabase
    .from('raport_incasari')
    .select('data, metoda, suma')
    .not('data', 'is', null)

  if (params.from) q = q.gte('data', params.from)
  if (params.to) q = q.lte('data', params.to)

  if (params.dimensiune !== 'all' && params.entityId) {
    const col = {
      locatie: 'id_locatie',
      sala: 'id_sala',
      curs: 'id_curs',
      teacher: 'id_teacher',
    }[params.dimensiune] as 'id_locatie' | 'id_sala' | 'id_curs' | 'id_teacher'
    q = q.eq(col, params.entityId)
  }

  const { data, error } = await q
  if (error) throw error

  const empty = (d: string): RaportZiRow => ({
    data: d,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    revolut: 0,
  })

  const byDate = new Map<string, RaportZiRow>()
  const summary = empty('')
  for (const r of data ?? []) {
    if (!r.data) continue
    const row = byDate.get(r.data) ?? empty(r.data)
    const s = Number(r.suma ?? 0)
    row.total += s
    summary.total += s
    const key = metodaKey(r.metoda)
    if (key) {
      row[key] += s
      summary[key] += s
    }
    byDate.set(r.data, row)
  }

  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.data.localeCompare(b.data),
  )

  return { rows, summary }
}

function metodaKey(
  m: Enums<'metoda_plata'> | null,
): 'cash' | 'card' | 'transfer' | 'revolut' | null {
  switch (m) {
    case 'Cash':     return 'cash'
    case 'Card':     return 'card'
    case 'Transfer': return 'transfer'
    case 'Revolut':  return 'revolut'
    default:         return null
  }
}

export type RestantaRow = Views<'plati_inrolari'>

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
      inventar(articol)
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
    .select(
      `
      id, data, suma, metoda, observatii, categorie, bucati,
      clienti(nume, prenume),
      enrollments(cursuri(numele)),
      inventar(articol),
      locatii(nume)
      `,
      { count: 'exact' },
    )
    .order('data', { ascending: false, nullsFirst: false })
    .range(rangeFrom, rangeTo)

  if (from) query = query.gte('data', from)
  if (to) query = query.lte('data', to)
  if (locatieId) query = query.eq('locatie', locatieId)
  if (categorie)
    query = query.eq('categorie', categorie as Enums<'categorie_incasare'>)

  const term = search.trim()
  if (term) query = query.ilike('observatii', `%${term}%`)

  type Raw = {
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
  }

  const { data, error, count } = await query
  if (error) throw error

  const rows: IncasareRow[] = (data as unknown as Raw[] | null ?? []).map(
    (r) => ({
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
            : null,
      locatie_nume: r.locatii?.nume ?? null,
    }),
  )

  return { rows, total: count ?? 0 }
}

export type RestanteListParams = {
  search: string
  page: number
  locatieId: string | null
  cursId: string | null
}

export type RestanteListResult = {
  rows: RestantaRow[]
  total: number
  sumRest: number
}

export async function listRestante({
  search,
  page,
  locatieId,
  cursId,
}: RestanteListParams): Promise<RestanteListResult> {
  const rangeFrom = page * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  const buildBase = () => {
    let q = supabase.from('plati_inrolari').select('*').gt('rest', 0)
    if (locatieId) q = q.eq('id_locatie', locatieId)
    if (cursId) q = q.eq('id_curs', cursId)
    const term = search.trim()
    if (term) {
      q = q.or(
        [
          `nume_client.ilike.%${term}%`,
          `prenume_client.ilike.%${term}%`,
          `nume_curs.ilike.%${term}%`,
        ].join(','),
      )
    }
    return q
  }

  const paginated = buildBase()
    .order('data_incepere', { ascending: false, nullsFirst: false })
    .range(rangeFrom, rangeTo)

  const { data, error } = await paginated
  if (error) throw error

  // Pentru count + sumă: fetch toate rest-urile (selectăm doar rest) ca să
  // putem agrega corect; e ok cât timp lista nu explodează (>10k).
  const allQ = buildBase()
  const { data: allRows, error: allErr } = await allQ.select('rest')
  if (allErr) throw allErr
  const sumRest = (allRows ?? []).reduce(
    (acc, r) => acc + Number(r.rest ?? 0),
    0,
  )
  const total = allRows?.length ?? 0

  return { rows: data ?? [], total, sumRest }
}
