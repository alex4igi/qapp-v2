import type { Enums, Voucher } from '@/types/db'
import { applyVoucher } from '@/features/vouchere/calc'

export type MotivPolitica = 'frati' | 'cross-sell' | null

type Props = {
  sumaSugerata: number | null
  voucherSelectat: Pick<Voucher, 'tip' | 'valoare'> | null
  tipPlata: Enums<'tip_plata'>
  isFacultativ: boolean
  policyPreview?: { politica_discount: number; suma_finala: number } | null
  esteReinscriere?: boolean
  // Rata lunară nepromo a cursului (pret_anual / 10) — baza pe care serverul
  // calculează −10% când rândul stă pe preț de reînscriere.
  rataNormala?: number | null
  motivPolitica?: MotivPolitica
}

// Info-box cu prețul sugerat (din curs) și — dacă există voucher selectat —
// discount-ul și totalul rezultat după aplicare.
export function PriceSummary({
  sumaSugerata,
  voucherSelectat,
  tipPlata,
  isFacultativ,
  policyPreview,
  esteReinscriere,
  rataNormala,
  motivPolitica,
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
  // Politica automată (cross-sell/family). Exclusivă cu voucherul manual. Pe
  // preț de reînscriere nu e −10% fix: serverul alege reducerea unică cea mai
  // bună (promo vs −10% pe rata normală), deci afișăm doar diferența rezultată.
  const showPolicy =
    !preview && policyPreview != null && policyPreview.politica_discount > 0

  // Pe abonamentul lunar voucherul manual acoperă o singură rată (prima creată).
  const voucherPeORata = !isFacultativ && tipPlata === 'Per luna'

  const pretLabel =
    tipPlata === 'Per luna' && !isFacultativ
      ? 'lunar'
      : tipPlata === 'Per an'
        ? 'anual'
        : tipPlata === 'Per sedinta'
          ? 'pe ședință'
          : ''

  // Eticheta reducerii spune recepției EXACT ce să-i repete părintelui: de ce
  // se aplică (frați / al 2-lea abonament) și pe ce bază s-a calculat.
  const motivText =
    motivPolitica === 'frati'
      ? 'al 2-lea abonament din familie'
      : motivPolitica === 'cross-sell'
        ? 'al 2-lea abonament al clientului'
        : 'al 2-lea abonament'
  const bazaPromo = esteReinscriere && rataNormala != null
  const reducereLabel = bazaPromo
    ? `Reducere 10% — ${motivText}, din prețul normal (${rataNormala} RON)`
    : `Reducere 10% — ${motivText}`

  return (
    <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/30 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-quasar-gray">
          Preț {pretLabel}
          {!isFacultativ && tipPlata === 'Per luna' && (
            <> ({esteReinscriere ? 'preț de reînscriere' : 'preț anual / 10'})</>
          )}
        </span>
        <span className="font-medium text-quasar-black">{sumaSugerata} RON</span>
      </div>
      {preview && (
        <>
          <div className="mt-1 flex items-baseline justify-between text-xs text-quasar-gray">
            <span>Voucher{voucherPeORata && ' (doar prima rată)'}</span>
            <span>− {preview.discount.toFixed(2)} RON</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-quasar-gray-light pt-1">
            <span className="font-medium">{voucherPeORata ? 'Prima rată' : 'Total'}</span>
            <span className="font-semibold text-quasar-black">
              {preview.sumaFinala.toFixed(2)} RON
            </span>
          </div>
          {voucherPeORata && (
            <p className="mt-1 text-xs text-quasar-gray">
              Restul ratelor rămân la {sumaSugerata} RON, cu reducerile automate (familie / al 2-lea curs) dacă e cazul.
            </p>
          )}
        </>
      )}
      {showPolicy && policyPreview && (
        <>
          <div className="mt-1 flex items-baseline justify-between text-xs text-quasar-gray">
            <span>{reducereLabel}</span>
            <span>− {policyPreview.politica_discount.toFixed(2)} RON</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-quasar-gray-light pt-1">
            <span className="font-medium">Total</span>
            <span className="font-semibold text-quasar-black">
              {policyPreview.suma_finala.toFixed(2)} RON
              {!isFacultativ && tipPlata === 'Per luna' && ' / lună'}
            </span>
          </div>
          {bazaPromo && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              💬 De spus părintelui: reducerile nu se cumulează. Am aplicat
              varianta mai avantajoasă — <strong>{policyPreview.suma_finala} RON</strong>{' '}
              (preț normal {rataNormala} RON − 10%), în loc de {sumaSugerata} RON
              (preț de reînscriere).
            </p>
          )}
        </>
      )}
    </div>
  )
}
