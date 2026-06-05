import type { Curs } from '@/types/db'
import type { PrevizualizareRecurent } from './helpers'

type Props = {
  preview: PrevizualizareRecurent | null
  cursSelectat: Curs | null
  blockantPretLipsa: boolean
}

// Pentru recurent + per lună: afișează câte rânduri se vor crea, eventuala
// prorata pentru prima lună la grupă cu semnare la mijlocul lunii, și un
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
          {preview.prorata?.sursaPret === 'sedinta' && (
            <p className="mt-1">
              Prima lună e prorata: <strong>{preview.prorata.sedinte}</strong>{' '}
              ședințe rămase × {cursSelectat?.pret_sedinta} RON ={' '}
              <strong>{preview.prorata.suma} RON</strong>.
            </p>
          )}
          {preview.prorata?.sursaPret === 'anual' && (
            <p className="mt-1">
              Prima lună e prorata <em>(LATESTART)</em> — calculată din prețul
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
