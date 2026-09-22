import type { Curs } from '@/types/db'
import type { PrevizualizareRecurent } from './helpers'

type Props = {
  preview: PrevizualizareRecurent | null
  cursSelectat: Curs | null
  blockantPretLipsa: boolean
}

// Pentru recurent + per lună: afișează câte rânduri se vor crea, eventuala
// prorata pentru prima lună (doar când clientul pierde ședințe din ea), și un
// blocker roșu dacă cursul nu are nici „Preț ședință" nici „Preț anual"
// (atunci nu se poate calcula prorata pentru înrolare târzie).
export function RecurentPreview({ preview, cursSelectat, blockantPretLipsa }: Props) {
  return (
    <>
      {preview && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>
            ⚠️ Se vor crea <strong>{preview.months}</strong> înrolări lunare,
            una pentru fiecare lună rămasă din sezon (până la 30 iunie).
          </p>
          {preview.primaLunaSarita && (
            <p className="mt-1">
              Luna aceasta nu mai are ședințe la cursul ales — prima rată e{' '}
              <strong>luna următoare</strong>.
            </p>
          )}
          {preview.prorata?.sursaPret === 'proportional' && (
            <p className="mt-1">
              Prima lună e prorata: prinde <strong>{preview.prorata.sedinte}</strong>{' '}
              din {preview.prorata.sedinteLuna} ședințe de la startul sezonului ={' '}
              <strong>{preview.prorata.suma} RON</strong>.
            </p>
          )}
          {preview.prorata?.sursaPret === 'sedinta' && (
            <p className="mt-1">
              Prima lună e prorata: <strong>{preview.prorata.sedinte}</strong>{' '}
              din {preview.prorata.sedinteLuna} ședințe × {cursSelectat?.pret_sedinta}{' '}
              RON = <strong>{preview.prorata.suma} RON</strong>
              {preview.prorata.plafonat && ' (plafonat la rata lunii)'}.
            </p>
          )}
          {preview.prorata?.sursaPret === 'anual' && (
            <p className="mt-1">
              Prima lună e prorata — calculată din prețul
              anual împărțit la ședințele totale ale sezonului × ședințele
              rămase. Suma exactă apare după salvare.
            </p>
          )}
        </div>
      )}

      {blockantPretLipsa && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ Cursul nu are nici <strong>„Preț ședință"</strong> nici{' '}
          <strong>„Preț anual"</strong> setat — nu pot calcula prorata pentru
          înrolare târzie. Setează cel puțin unul în Studio → Cursuri.
        </p>
      )}
    </>
  )
}
