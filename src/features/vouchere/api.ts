import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Voucher, InsertDto, UpdateDto, Enums } from '@/types/db'
import { validateVoucher } from './calc'

type TipPlata = Enums<'tip_plata'>

export const PAGE_SIZE = 25

export type VouchereListParams = {
  search: string
  page: number
}

export type VouchereListResult = {
  rows: Voucher[]
  total: number
}

export async function listVouchere({
  search,
  page,
}: VouchereListParams): Promise<VouchereListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('vouchere')
    .select('*', { count: 'exact' })
    .order('cod_voucher', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, ['cod_voucher', 'descriere'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createVoucher(
  dto: InsertDto<'vouchere'>,
): Promise<Voucher> {
  const { data, error } = await supabase
    .from('vouchere')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateVoucher(
  id: string,
  dto: UpdateDto<'vouchere'>,
): Promise<Voucher> {
  const { data, error } = await supabase
    .from('vouchere')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteVoucher(id: string): Promise<void> {
  const { error } = await supabase.from('vouchere').delete().eq('id', id)
  if (error) throw error
}

// Verifică dacă un cod_voucher e deja folosit (excluzând eventual un voucher.id la edit).
export async function voucherCodExists(
  cod: string,
  excludeId?: string,
): Promise<boolean> {
  const trimmed = cod.trim()
  if (!trimmed) return false
  let query = supabase
    .from('vouchere')
    .select('id', { count: 'exact', head: true })
    .eq('cod_voucher', trimmed)
  if (excludeId) query = query.neq('id', excludeId)
  const { count, error } = await query
  if (error) throw error
  return (count ?? 0) > 0
}

export type EligibilityContext = {
  altCursActivRecurent: { cursId: string; cursulNume: string }[]
  fratiActivi: { id: string; nume: string; prenume: string | null }[]
}

const EMPTY_CONTEXT: EligibilityContext = {
  altCursActivRecurent: [],
  fratiActivi: [],
}

// Verifică, pentru un client, dacă există context care declanșează politicile
// automate (cross-sell / family). Folosit la creare înrolare ca alertă info.
export async function getClientEligibilityContext(
  clientId: string,
): Promise<EligibilityContext> {
  if (!clientId) return EMPTY_CONTEXT
  const today = new Date().toISOString().slice(0, 10)

  // 1. Familia clientului
  const { data: client, error: clientErr } = await supabase
    .from('clienti')
    .select('familia')
    .eq('id', clientId)
    .single()
  if (clientErr) throw clientErr

  // 2. Înrolări recurente neîncheiate ale clientului (cross-sell)
  // Doar `Per luna`: politica −10% se aplică exclusiv pe înrolări lunare.
  // O înrolare `Per an` NU declanșează cross-sell (vezi recalculate_pool_discount).
  // Includem și înrolările care ÎNCĂ NU au început: recalculate_pool_discount
  // lucrează pe lunile ≥ luna curentă, deci în perioada de reînscrieri (august,
  // pentru un sezon care începe în septembrie) politica se aplică deja, chiar
  // dacă nicio înrolare nu e „în curs" azi. Filtrarea pe data_incepere ≤ azi
  // ascundea exact cazul în care recepția are cea mai mare nevoie de alertă.
  const { data: ownEnrollments, error: ownErr } = await supabase
    .from('enrollments')
    .select('cursul, cursuri:cursul(numele)')
    .eq('client', clientId)
    .eq('reziliat', false)
    .eq('tip_plata', 'Per luna')
    .or(`data_final.is.null,data_final.gte.${today}`)
  if (ownErr) throw ownErr

  const altCursActivRecurent: EligibilityContext['altCursActivRecurent'] = []
  const seenCursuri = new Set<string>()

  for (const e of ownEnrollments ?? []) {
    const c = (e as { cursuri: { numele: string } | null }).cursuri
    if (!e.cursul || !c) continue
    if (seenCursuri.has(e.cursul)) continue
    seenCursuri.add(e.cursul)
    altCursActivRecurent.push({ cursId: e.cursul, cursulNume: c.numele })
  }

  // 3. Frați cu înrolări recurente neîncheiate (inclusiv sezonul care urmează)
  let fratiActivi: EligibilityContext['fratiActivi'] = []
  if (client?.familia) {
    const { data: siblings, error: sibErr } = await supabase
      .from('clienti')
      .select('id, nume, prenume')
      .eq('familia', client.familia)
      .neq('id', clientId)
    if (sibErr) throw sibErr

    const siblingIds = (siblings ?? []).map((s) => s.id)
    if (siblingIds.length > 0) {
      const { data: sibEnrollments, error: sibEnrErr } = await supabase
        .from('enrollments')
        .select('client')
        .in('client', siblingIds)
        .eq('reziliat', false)
        .eq('tip_plata', 'Per luna')
        .or(`data_final.is.null,data_final.gte.${today}`)
      if (sibEnrErr) throw sibEnrErr

      const activeSiblingIds = new Set(
        (sibEnrollments ?? []).map((e) => e.client).filter(Boolean) as string[],
      )
      fratiActivi = (siblings ?? []).filter((s) => activeSiblingIds.has(s.id))
    }
  }

  return { altCursActivRecurent, fratiActivi }
}

export type AvailableVouchereParams = {
  forCurs?: string | null
  forTipPlata?: TipPlata | null
  activeOnly?: boolean
}

// Întoarce vouchere aplicabile într-un context dat (curs, tip plată).
// Filtrele forCurs / forTipPlata acceptă atât vouchere neutre (NULL pe coloană)
// cât și pe cele cu valoare egală. `activeOnly` filtrează data validity +
// numar_utilizari pe client.
export async function listAvailableVouchere(
  params: AvailableVouchereParams = {},
): Promise<Voucher[]> {
  let query = supabase
    .from('vouchere')
    .select('*')
    .order('cod_voucher', { ascending: true })

  if (params.forCurs) {
    query = query.or(`curs.is.null,curs.eq.${params.forCurs}`)
  }
  if (params.forTipPlata) {
    query = query.or(
      `tip_enrollment.is.null,tip_enrollment.eq.${params.forTipPlata}`,
    )
  }

  const { data, error } = await query
  if (error) throw error

  let rows = data ?? []
  if (params.activeOnly) {
    const today = new Date()
    rows = rows.filter(
      (v) =>
        validateVoucher(v, {
          today,
          cursId: params.forCurs ?? null,
          tipPlata: params.forTipPlata ?? null,
        }).valid,
    )
  }
  return rows
}
