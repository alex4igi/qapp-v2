import { supabase } from '@/lib/supabase'
import { invokeEdge } from '@/lib/invokeEdge'

// Restituirea unei plăți online (Netopia): banii pe card + încasarea negativă +
// audit + rezervarea OPEN anulată + stornarea FGO, toate în edge function `netopia-refund`.

// confirm_netopia_payment scrie referința comenzii în observații („… Netopia QM-…").
export function orderRefDinObservatii(observatii: string | null): string | null {
  return observatii?.match(/Netopia (QM-[A-Z0-9-]+)/)?.[1] ?? null
}

export type RestituireRow = {
  id: string
  suma: number
  motiv: string
  mod: 'netopia' | 'manual'
  status: 'in_curs' | 'efectuata' | 'esuata'
  eroare: string | null
  fgo_status: 'stornata' | 'de_stornat_manual' | 'eroare' | 'fara_factura' | null
  fgo_storno: string | null
  fgo_eroare: string | null
  created: string
}

export type ComandaOnline = {
  order_ref: string
  order_type: string
  amount: number
  status: string
  created: string
  areNtpId: boolean
  factura: string | null
  restituiri: RestituireRow[]
  restituit: number
}

export async function getComandaOnline(orderRef: string): Promise<ComandaOnline> {
  const [orderRes, restRes] = await Promise.all([
    supabase
      .from('netopia_orders')
      .select('order_ref, order_type, amount, status, created, ntp_id, netopia_transaction_id, fgo_factura')
      .eq('order_ref', orderRef)
      .single(),
    supabase
      .from('restituiri_online')
      .select('id, suma, motiv, mod, status, eroare, fgo_status, fgo_storno, fgo_eroare, created')
      .eq('order_ref', orderRef)
      .order('created', { ascending: true }),
  ])
  if (orderRes.error) throw orderRes.error
  if (restRes.error) throw restRes.error
  const o = orderRes.data
  const restituiri = (restRes.data ?? []).map((r) => ({ ...r, suma: Number(r.suma) })) as RestituireRow[]
  const ntp = o.ntp_id ?? o.netopia_transaction_id
  return {
    order_ref: o.order_ref,
    order_type: o.order_type,
    amount: Number(o.amount),
    status: o.status,
    created: o.created,
    areNtpId: !!ntp && /^\d+$/.test(ntp),
    factura: o.fgo_factura,
    restituiri,
    restituit: restituiri.filter((r) => r.status === 'efectuata').reduce((a, r) => a + r.suma, 0),
  }
}

export type RezultatRestituire = {
  ok: true
  status: 'efectuata' | 'esuata'
  fgo_status?: RestituireRow['fgo_status']
  fgo_storno?: string
  fgo_eroare?: string
}

export function restituieOnline(params: {
  orderRef: string
  suma: number
  motiv: string
  mod: 'netopia' | 'manual'
}): Promise<RezultatRestituire> {
  return invokeEdge('netopia-refund', {
    actiune: 'restituie',
    order_ref: params.orderRef,
    suma: params.suma,
    motiv: params.motiv.trim(),
    mod: params.mod,
  })
}

// Pentru o restituire rămasă „în curs" (răspunsul Netopia s-a pierdut): omul a verificat
// în panoul Netopia și spune ce s-a întâmplat.
export function inchideRestituire(id: string, baniiAuPlecat: boolean): Promise<RezultatRestituire> {
  return invokeEdge('netopia-refund', { actiune: baniiAuPlecat ? 'finalizeaza' : 'renunta', id })
}
