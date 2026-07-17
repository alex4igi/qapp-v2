import { supabase } from '@/lib/supabase'
import type {
  EmitResult,
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

export type MarkItem = {
  ref: string
  client_nume: string
  suma: number
  data: string
  descriere: string
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
  return (data ?? []) as FacturaRow[]
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
  return (data ?? []) as FacturaRow[]
}

// Istoric-jurnal (banca): tot ce a avut o acțiune (plată sau factură/ignorare).
export async function listBancaIstoric(): Promise<FacturaRow[]> {
  let q = supabase
    .from('facturi_fgo')
    .select('*')
    .eq('sursa', 'banca')
    .or('platit_la.not.is.null,status.in.(Emisa,Marcata,Eroare,Ignorata)')
  for (const [col, opts] of STABLE_ORDER) q = q.order(col, opts)
  const { data, error } = await q.limit(50)
  if (error) throw error
  return (data ?? []) as FacturaRow[]
}

// Marchează transferul ca „înregistrat" + stochează liniile derivate din plată.
export async function salveazaPlataBanca(
  ref: string,
  linii: { articol: string | null; suma: number }[],
): Promise<void> {
  const { error } = await supabase
    .from('facturi_fgo')
    .update({ platit_la: new Date().toISOString(), linii })
    .eq('ref', ref)
  if (error) throw error
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
