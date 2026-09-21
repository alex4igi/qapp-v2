import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import {
  LUNI_PANA_LA_PROPUNERE,
  eLunaLansarii,
  serieSubMinim,
  subMinimLunaAsta,
  type GrupaPragMinim,
} from '../api'

type Props = {
  grupe: GrupaPragMinim[]
}

// Lista de lucru a managerului pe sezonul în curs: ce grupe sunt propuse pentru
// suspendare, ce grupe se apropie și ce grupe sunt sub minim chiar luna asta.
// Decizia se ia din fișa fiecărei grupe.
export function PragMinimPanel({ grupe }: Props) {
  const [observatieOpen, setObservatieOpen] = useState(false)
  const [lunaAstaOpen, setLunaAstaOpen] = useState<boolean | null>(null)
  const inCurs = grupe.filter((g) => g.sezonInCurs)
  if (inCurs.length === 0) return null

  const deSuspendat = inCurs.filter((g) => g.stare === 'de_suspendat')
  const inObservatie = inCurs.filter((g) => g.stare === 'in_observatie')
  // Cele mai goale primele — acolo e cel mai puțin timp de umplut.
  const lunaAsta = inCurs
    .filter(subMinimLunaAsta)
    .sort((a, b) => (a.cursantiLunaCurenta ?? 0) - (b.cursantiLunaCurenta ?? 0))
  const toateInRodaj = inCurs.every(
    (g) => g.stare === 'in_rodaj' || g.stare === 'suspendat',
  )
  // Deschisă implicit doar când e singurul semnal de pe ecran; lângă grupe propuse
  // pentru suspendare ar îneca lista care cere o decizie.
  const lunaAstaDeschisa =
    lunaAstaOpen ?? (deSuspendat.length === 0 && inObservatie.length === 0)

  if (deSuspendat.length === 0 && inObservatie.length === 0 && lunaAsta.length === 0) {
    return (
      <p className="mb-4 text-xs text-quasar-gray">
        Prag minim de cursanți:{' '}
        {toateInRodaj
          ? `grupele sunt în rodaj — se testează lunile încheiate de după luna lansării, ${LUNI_PANA_LA_PROPUNERE} la rând sub minim înseamnă propunere de suspendare.`
          : 'nicio grupă sub minim.'}
      </p>
    )
  }

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-quasar-black">
          Prag minim de cursanți
        </h2>
        <p className="text-xs text-quasar-gray">
          {LUNI_PANA_LA_PROPUNERE} luni încheiate sub minim ⇒ propusă pentru
          suspendare. Nu se suspendă automat.
        </p>
      </header>

      {deSuspendat.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {deSuspendat.map((g) => (
            <GrupaRand key={g.cursId} g={g} tone="danger" />
          ))}
        </ul>
      )}

      {inObservatie.length > 0 && (
        <div className={deSuspendat.length > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}>
          <button
            type="button"
            aria-expanded={observatieOpen}
            onClick={() => setObservatieOpen((o) => !o)}
            className="flex items-center gap-2 text-xs font-medium text-quasar-gray hover:text-quasar-black"
          >
            <span className={`transition-transform ${observatieOpen ? 'rotate-90' : ''}`}>
              ▶
            </span>
            În observație ({inObservatie.length})
          </button>
          {observatieOpen && (
            <ul className="mt-1 divide-y divide-gray-100">
              {inObservatie.map((g) => (
                <GrupaRand key={g.cursId} g={g} tone="warn" />
              ))}
            </ul>
          )}
        </div>
      )}

      {lunaAsta.length > 0 && (
        <div
          className={
            deSuspendat.length > 0 || inObservatie.length > 0
              ? 'mt-2 border-t border-gray-100 pt-2'
              : ''
          }
        >
          <button
            type="button"
            aria-expanded={lunaAstaDeschisa}
            onClick={() => setLunaAstaOpen(!lunaAstaDeschisa)}
            className="flex items-center gap-2 text-xs font-medium text-quasar-gray hover:text-quasar-black"
          >
            <span className={`transition-transform ${lunaAstaDeschisa ? 'rotate-90' : ''}`}>
              ▶
            </span>
            Sub minim luna asta ({lunaAsta.length})
          </button>
          {lunaAstaDeschisa && (
            <>
              <p className="mt-1 text-xs text-quasar-gray">
                Cifra lunii în curs — grupa încă se poate umple. Intră la
                numărătoarea celor {LUNI_PANA_LA_PROPUNERE} luni abia când luna se
                încheie; luna lansării nu se numără.
              </p>
              <ul className="mt-1 divide-y divide-gray-100">
                {lunaAsta.map((g) => (
                  <GrupaRand key={g.cursId} g={g} tone="warn" timpuriu />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function GrupaRand({
  g,
  tone,
  timpuriu = false,
}: {
  g: GrupaPragMinim
  tone: 'danger' | 'warn'
  /** Avertizare pe luna în curs: fără serie de luni încheiate. */
  timpuriu?: boolean
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <div className="min-w-0">
        <Link
          to={`/cursuri/${g.cursId}`}
          className="text-sm font-medium text-quasar-black hover:underline"
        >
          {g.cursNume}
        </Link>
        <p className="text-xs text-quasar-gray">
          {[g.salaNume, g.teacherNume, `minim ${g.minim}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-quasar-gray">
        {timpuriu ? (
          eLunaLansarii(g) && <span>luna lansării</span>
        ) : (
          <span>{serieSubMinim(g)}</span>
        )}
        {!timpuriu && g.cursantiLunaCurenta != null && (
          <span>
            luna asta {g.cursantiLunaCurenta}/{g.minim}
          </span>
        )}
        <Badge tone={tone}>
          {timpuriu
            ? `${g.cursantiLunaCurenta}/${g.minim}`
            : g.luniSubConsecutive === 1
              ? '1 lună'
              : `${g.luniSubConsecutive} luni`}
        </Badge>
      </div>
    </li>
  )
}
