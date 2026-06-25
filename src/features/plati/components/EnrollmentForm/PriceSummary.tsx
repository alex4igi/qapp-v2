import type { Enums, Voucher } from '@/types/db'
import { applyVoucher } from '@/features/vouchere/calc'

type Props = {
  sumaSugerata: number | null
  voucherSelectat: Voucher | null
  tipPlata: Enums<'tip_plata'>
  isFacultativ: boolean
  policyPreview?: { politica_discount: number; suma_finala: number } | null
}

// Info-box cu prețul sugerat (din curs) și — dacă există voucher selectat —
// discount-ul și totalul rezultat după aplicare.
export function PriceSummary({
  sumaSugerata,
  voucherSelectat,
  tipPlata,
  isFacultativ,
  policyPreview,
}: Props) {
  if (sumaSugerata == null) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        ⚠️ Cursul nu are preț setat pentru <strong>{tipPlata}</strong>.
        Setează-l în Studio → Cursuri înainte să continui.
      </p>
    )
  }

  const preview = voucherSelectat ? applyVoucher(sumaSugerata, voucherSelectat) : null
  // Politica automată −10% (cross-sell/family). Exclusivă cu voucherul manual.
  const showPolicy =
    !preview && policyPreview != null && policyPreview.politica_discount > 0

  const pretLabel =
    tipPlata === 'Per luna' && !isFacultativ
      ? 'lunar'
      : tipPlata === 'Per an'
        ? 'anual'
        : tipPlata === 'Per sedinta'
          ? 'pe ședință'
          : ''

  return (
    <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/30 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-quasar-gray">
          Preț {pretLabel}
          {!isFacultativ && tipPlata === 'Per luna' && <> (preț anual / 10)</>}
        </span>
        <span className="font-medium text-quasar-black">{sumaSugerata} RON</span>
      </div>
      {preview && (
        <>
          <div className="mt-1 flex items-baseline justify-between text-xs text-quasar-gray">
            <span>Voucher</span>
            <span>− {preview.discount.toFixed(2)} RON</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-quasar-gray-light pt-1">
            <span className="font-medium">Total</span>
            <span className="font-semibold text-quasar-black">
              {preview.sumaFinala.toFixed(2)} RON
              {!isFacultativ && tipPlata === 'Per luna' && ' / lună'}
            </span>
          </div>
        </>
      )}
      {showPolicy && policyPreview && (
        <>
          <div className="mt-1 flex items-baseline justify-between text-xs text-quasar-gray">
            <span>Politică cross-sell/family</span>
            <span>− {policyPreview.politica_discount.toFixed(2)} RON</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-quasar-gray-light pt-1">
            <span className="font-medium">Total</span>
            <span className="font-semibold text-quasar-black">
              {policyPreview.suma_finala.toFixed(2)} RON
              {!isFacultativ && tipPlata === 'Per luna' && ' / lună'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
