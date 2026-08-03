import { supabase } from '@/lib/supabase'
import { clientIdRegistru, familiaIdRegistru } from './alocari'
import type {
  Alocare,
  EmitResult,
  FacturaLinie,
  FacturaRow,
  FacturaStatus,
  FacturaSursa,
  IngestSummary,
  MatchSuggestion,
} from './types'

async function invoke<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('autofgo', {
    body: { action, ...payload },
  })
  const errMsg = (data as { error?: string } | null)?.error
  if (error || errMsg) throw new Error(errMsg || error?.message || 'Eroare necunoscută.')
  return data as T
}

export type EmitItem = {
  ref: string
  client_nume: string
  suma: number
  data: string
  descriere: string
  valuta?: string
  client_id?: string | null
  familia_id?: string | null
  // Liniile facturii FGO (câte o linie per articol + suma ei). Sumele însumate = suma.
  linii: { articol: string; suma: number }[]
}

// Marcarea „facturat de mână în FGO" cere numărul facturii: fără el afirmația nu e
// verificabilă, iar un click greșit scotea transferul din lista de lucru nefacturat.
export type MarkItem = {
  ref: string
  client_nume: string
  suma: number
  data: string
  descriere: string
  numar_factura: string
}

export const ingestExtras = (csv: string) => invoke<IngestSummary>('ingest', { csv })

export const emiteFacturi = (firmaCui: string, items: EmitItem[]) =>
  invoke<{ results: EmitResult[] }>('emite', { firmaCui, items })

export const marcheazaFacturi = (firmaCui: string, items: MarkItem[]) =>
  invoke<{ results: EmitResult[] }>('marcheaza', { firmaCui, items })

export const retryPortal = (orderRef: string) =>
  invoke<{ result: { status: string; factura?: string | null; error?: string } }>(
    'retry_portal',
    { orderRef },
  )

// Plată online confirmată, dar încă nefacturată (toggle off la momentul plății sau
// nicio încercare de emitere). Fiecare devine o factură cu un click („Emite factură").
export type PortalPendingLine = {
  denumire: string
  suma: number
  articol: string | null
  certain: boolean
}

export type PortalPendingRow = {
  order_ref: string
  client_nume: string
  suma: number
  descriere: string
  linii: PortalPendingLine[]
  // toate liniile mapate cu certitudine? dacă nu, recepția alege articolul
  certain: boolean
  data: string
}

export const listPortalPending = () =>
  invoke<{ items: PortalPendingRow[] }>('portal_pending', {})

// Emitere manuală de recepție: liniile (articol FGO + sumă) alese în UI.
export const emitePortal = (orderRef: string, linii: { denumire: string; suma: number }[]) =>
  invoke<{ result: { status: string; factura?: string | null; error?: string } }>(
    'emite_portal',
    { orderRef, linii },
  )

// „De facturat" (tab Clienți): încasările clienților cu marcajul „factură lunară",
// de la data activării încolo, care nu au încă factură în registru.
export type ClientPendingRow = {
  incasare_id: string
  client_id: string
  client_nume: string
  data: string
  metoda: string
  suma: number
  linii: PortalPendingLine[]
  certain: boolean
}

export async function listClientiPending(): Promise<ClientPendingRow[]> {
  const { data, error } = await supabase.rpc('get_clienti_pending_incasari')
  if (error) throw error
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Omit<ClientPendingRow, 'linii'> & { linii: unknown }
    return { ...row, linii: (row.linii ?? []) as PortalPendingLine[] }
  })
}

// Emitere „la cerere" pe o încasare; dryRun întoarce doar preview-ul (fără factură reală).
export const emiteClient = (
  incasareId: string,
  linii: { denumire: string; suma: number }[],
  dryRun = false,
) =>
  invoke<{ result: { status: string; factura?: string | null; error?: string; preview?: unknown } }>(
    'emite_client',
    { incasareId, linii, dryRun },
  )

// Ordine deterministă: data_tranzactie e doar ziua, deci fără tie-break rândurile din
// aceeași zi se reamestecă la fiecare UPDATE (Postgres mută fizic rândul). created + ref
// nu se schimbă niciodată → poziția rămâne fixă după orice procedură.
const STABLE_ORDER = [
  ['data_tranzactie', { ascending: false }],
  ['created', { ascending: false }],
  ['ref', { ascending: true }],
] as const

export async function listFacturi(
  sursa: FacturaSursa,
  statusIn?: FacturaStatus[],
): Promise<FacturaRow[]> {
  let q = supabase
    .from('facturi_fgo')
    .select('*')
    .eq('sursa', sursa)
  for (const [col, opts] of STABLE_ORDER) q = q.order(col, opts)
  if (statusIn && statusIn.length) q = q.in('status', statusIn)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as FacturaRow[]
}

// „De procesat" (banca): NOT done AND NOT Ignorata, unde done = plătit ȘI facturat.
export async function listBancaWorklist(): Promise<FacturaRow[]> {
  let q = supabase
    .from('facturi_fgo')
    .select('*')
    .eq('sursa', 'banca')
    .neq('status', 'Ignorata')
    .or('platit_la.is.null,status.not.in.(Emisa,Marcata)')
  for (const [col, opts] of STABLE_ORDER) q = q.order(col, opts)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as FacturaRow[]
}

export const ISTORIC_PAGE_SIZE = 25

export type IstoricPage = { rows: FacturaRow[]; total: number }

// Istoric-jurnal (banca): tot ce a avut o acțiune (plată sau factură/ignorare).
export async function listBancaIstoric(page = 0): Promise<IstoricPage> {
  const from = page * ISTORIC_PAGE_SIZE
  let q = supabase
    .from('facturi_fgo')
    .select('*', { count: 'exact' })
    .eq('sursa', 'banca')
    .or('platit_la.not.is.null,status.in.(Emisa,Marcata,Eroare,Ignorata)')
  for (const [col, opts] of STABLE_ORDER) q = q.order(col, opts)
  const { data, error, count } = await q.range(from, from + ISTORIC_PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as FacturaRow[], total: count ?? 0 }
}

// Adaugă plata înregistrată pentru UN client la liniile transferului. Citim rândul
// proaspăt din DB, nu din cache-ul React Query: alocările și plățile scriu pe același
// jsonb, iar un update pornit dintr-un snapshot vechi ar șterge liniile fratelui.
export async function salveazaPlataBanca(
  ref: string,
  clientId: string,
  linii: FacturaLinie[],
): Promise<void> {
  const { data: cur, error: readErr } = await supabase
    .from('facturi_fgo')
    .select('linii, alocari, platit_la')
    .eq('ref', ref)
    .single()
  if (readErr) throw readErr

  const prev = (cur.linii ?? []) as FacturaLinie[]
  const toate = [...prev, ...linii.map((l) => ({ ...l, client_id: clientId }))]
  const alocari = (cur.alocari ?? []) as Alocare[]

  // Transferul e „înregistrat" abia când fiecare beneficiar are cel puțin o linie.
  // Rândurile fără alocări păstrează comportamentul vechi: prima plată îl marchează.
  const totPlatit =
    alocari.length === 0 ||
    alocari.every((a) => toate.some((l) => l.client_id === a.client_id))

  // platit_la e monoton: dacă l-am șterge când apare un beneficiar nou, un rând deja în
  // „De facturat" ar sări înapoi în „Nou din extras".
  const patch: { linii: FacturaLinie[]; platit_la?: string } = { linii: toate }
  if (totPlatit && !cur.platit_la) patch.platit_la = new Date().toISOString()

  const { error } = await supabase.from('facturi_fgo').update(patch).eq('ref', ref)
  if (error) throw error
}

// Salvează CINE sunt beneficiarii. Nu atinge linii/platit_la/status — alocarea e o
// afirmație despre potrivire, nu despre bani.
export async function saveAlocari(ref: string, alocari: Alocare[]): Promise<void> {
  const { error } = await supabase
    .from('facturi_fgo')
    .update({
      alocari,
      client_id: clientIdRegistru(alocari),
      familia_id: familiaIdRegistru(alocari),
    })
    .eq('ref', ref)
  if (error) throw error
}

// Membrii unei familii, direct în forma folosită de matcher — pentru cazul „transferul e
// pentru frați": alegi familia, bifezi copiii.
export async function listMembriFamilie(familiaId: string): Promise<MatchSuggestion[]> {
  const { data, error } = await supabase
    .from('clienti')
    .select('id, nume, prenume, familia, status')
    .eq('familia', familiaId)
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c) => ({
    tip: 'client' as const,
    id: c.id,
    nume: [c.nume, c.prenume].filter(Boolean).join(' ').trim(),
    familia_id: c.familia,
    scor: 0,
    status: c.status,
  }))
}

// „Ignoră" — scoate rândurile din lista de lucru fără să le șteargă (păstrează
// deduplicarea pe ref). Pentru transferuri care nu se facturează / deja facturate manual.
export async function ignoraFacturi(refs: string[]): Promise<void> {
  if (refs.length === 0) return
  const { error } = await supabase
    .from('facturi_fgo')
    .update({ status: 'Ignorata' })
    .in('ref', refs)
  if (error) throw error
}

export async function matchPayer(
  nume: string,
  detalii: string,
): Promise<MatchSuggestion[]> {
  const { data, error } = await supabase.rpc('match_bank_payer', {
    p_nume: nume,
    p_detalii: detalii,
  })
  if (error) throw error
  return (data ?? []) as MatchSuggestion[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Căutare manuală peste clienți (nume/prenume/telefon) — fallback când sugestiile nu nimeresc.
// Acceptă mai multe cuvinte („olaru alessia") și un UUID de client (apare în detaliile
// transferurilor din portal).
export async function searchClienti(term: string): Promise<MatchSuggestion[]> {
  const trimmed = term.trim()
  let query = supabase.from('clienti').select('id, nume, prenume, familia, status')
  if (UUID_RE.test(trimmed)) {
    query = query.eq('id', trimmed)
  } else {
    // .or() repetat se combină cu AND: fiecare cuvânt trebuie să apară în una din coloane
    for (const tok of trimmed.split(/\s+/)) {
      const t = `%${tok.replace(/[,()]/g, '')}%`
      query = query.or(`nume.ilike.${t},prenume.ilike.${t},telefon.ilike.${t}`)
    }
  }
  const { data, error } = await query.limit(25)
  if (error) throw error
  const rank: Record<string, number> = { Activ: 0, Inactiv: 1 }
  return (data ?? [])
    .sort((a, b) => (rank[a.status ?? ''] ?? 2) - (rank[b.status ?? ''] ?? 2))
    .map((c) => ({
      tip: 'client' as const,
      id: c.id,
      nume: [c.nume, c.prenume].filter(Boolean).join(' ').trim(),
      familia_id: c.familia,
      scor: 0,
      status: c.status,
    }))
}

export async function warnExisting(
  clientId: string,
  suma: number,
  data: string,
): Promise<boolean> {
  const { data: d, error } = await supabase.rpc('warn_existing_incasare', {
    p_client: clientId,
    p_suma: suma,
    p_data: data,
  })
  if (error) throw error
  return Boolean(d)
}
