import { Button } from '@/components/ui'
import {
  LUNI_PANA_LA_PROPUNERE,
  lunaScurta,
  serieSubMinim,
  type GrupaPragMinim,
} from '../api'

type Props = {
  grupa: GrupaPragMinim
  /** Deschide suspendarea cu triajul cursanților; lipsă = fără drept de suspendare. */
  onSuspenda?: () => void
}

// Semnalul apare doar cât sezonul grupei e în curs: pe un sezon încheiat nu mai
// ai ce suspenda, iar pe grupele în rodaj nu s-a încheiat încă nicio lună testată.
export function PragMinimBanner({ grupa, onSuspenda }: Props) {
  if (!grupa.sezonInCurs) return null
  if (grupa.stare !== 'de_suspendat' && grupa.stare !== 'in_observatie') return null

  const luniRamase = LUNI_PANA_LA_PROPUNERE - grupa.luniSubConsecutive
  const lunaAsta =
    grupa.cursantiLunaCurenta != null
      ? `luna asta ${grupa.cursantiLunaCurenta}/${grupa.minim}`
      : null
  const detalii = [
    `minim ${grupa.minim}${grupa.salaNume ? ` în ${grupa.salaNume}` : ''}`,
    serieSubMinim(grupa),
    lunaAsta,
  ]
    .filter(Boolean)
    .join(' · ')

  if (grupa.stare === 'de_suspendat') {
    return (
      <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-900">
              Sub minimul de cursanți de {grupa.luniSubConsecutive} luni la rând
            </p>
            <p className="mt-0.5 text-sm text-red-800">{detalii}</p>
            <p className="mt-1 text-xs text-red-800/80">
              Grupa e propusă pentru suspendare, cu cursanții repartizați. Nu se
              suspendă singură — decizia e a ta.
            </p>
          </div>
          {onSuspenda && (
            <Button variant="danger" onClick={onSuspenda}>
              ⏸ Suspendă și repartizează
            </Button>
          )}
        </div>
      </div>
    )
  }

  const ultima = grupa.luni[grupa.luni.length - 1]?.luna
  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-bold text-amber-900">
        Sub minimul de cursanți {grupa.luniSubConsecutive === 1 ? 'o lună' : `${grupa.luniSubConsecutive} luni`}
        {ultima ? ` (până în ${lunaScurta(ultima)})` : ''}
      </p>
      <p className="mt-0.5 text-sm text-amber-800">{detalii}</p>
      <p className="mt-1 text-xs text-amber-800/80">
        {luniRamase === 1
          ? `Dacă și luna asta se încheie sub ${grupa.minim}, grupa e propusă pentru suspendare.`
          : `Încă ${luniRamase} luni sub ${grupa.minim} și grupa e propusă pentru suspendare.`}
      </p>
    </div>
  )
}
