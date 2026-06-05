import type { Voucher, Enums } from '@/types/db'

type TipPlata = Enums<'tip_plata'>

export type ValidateContext = {
  today?: Date
  cursId?: string | null
  tipPlata?: TipPlata | null
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function validateVoucher(
  v: Voucher,
  ctx: ValidateContext = {},
): ValidationResult {
  const todayIso = toIsoDate(ctx.today ?? new Date())

  if (v.data_inceperii && v.data_inceperii > todayIso) {
    return { valid: false, reason: `Voucherul devine valabil de la ${v.data_inceperii}.` }
  }
  if (v.data_expirarii && v.data_expirarii < todayIso) {
    return { valid: false, reason: `Voucherul a expirat la ${v.data_expirarii}.` }
  }
  if (v.numar_utilizari != null && v.numar_utilizari <= 0) {
    return { valid: false, reason: 'Voucherul nu mai are utilizări disponibile.' }
  }
  if (v.curs && ctx.cursId && v.curs !== ctx.cursId) {
    return { valid: false, reason: 'Voucherul nu se aplică pe acest curs.' }
  }
  if (v.tip_enrollment && ctx.tipPlata && v.tip_enrollment !== ctx.tipPlata) {
    return {
      valid: false,
      reason: `Voucherul se aplică doar pe înrolări "${v.tip_enrollment}".`,
    }
  }
  return { valid: true }
}

export type DiscountResult = {
  discount: number
  sumaFinala: number
}

export function applyVoucher(
  suma: number,
  v: Voucher | null | undefined,
): DiscountResult {
  if (!v || v.valoare == null || v.tip == null) {
    return { discount: 0, sumaFinala: suma }
  }
  const valoare = Number(v.valoare)
  let discount = 0
  if (v.tip === 'Procent') {
    discount = (suma * valoare) / 100
  } else if (v.tip === 'Valoare') {
    discount = Math.min(suma, valoare)
  }
  // 'Special' — rezervat pentru mecanisme cu calcul propriu (ex: LATESTART/prorata).
  const sumaFinala = Math.max(0, suma - discount)
  return { discount, sumaFinala }
}
