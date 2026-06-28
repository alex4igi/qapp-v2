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

export async function listFacturi(
  sursa: FacturaSursa,
  statusIn?: FacturaStatus[],
): Promise<FacturaRow[]> {
  let q = supabase
    .from('facturi_fgo')
    .select('*')
    .eq('sursa', sursa)
    .order('data_tranzactie', { ascending: false })
  if (statusIn && statusIn.length) q = q.in('status', statusIn)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as FacturaRow[]
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

// Căutare manuală peste clienți (nume/prenume/telefon) — fallback când sugestiile nu nimeresc.
export async function searchClienti(term: string): Promise<MatchSuggestion[]> {
  const t = `%${term.trim()}%`
  const { data, error } = await supabase
    .from('clienti')
    .select('id, nume, prenume, familia')
    .or(`nume.ilike.${t},prenume.ilike.${t},telefon.ilike.${t}`)
    .limit(10)
  if (error) throw error
  return (data ?? []).map((c) => ({
    tip: 'client' as const,
    id: c.id,
    nume: [c.nume, c.prenume].filter(Boolean).join(' ').trim(),
    familia_id: c.familia,
    scor: 0,
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
