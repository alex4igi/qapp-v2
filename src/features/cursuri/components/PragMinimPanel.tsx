import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import {
  LUNI_PANA_LA_PROPUNERE,
  serieSubMinim,
  type GrupaPragMinim,
} from '../api'

type Props = {
  grupe: GrupaPragMinim[]
}

// Lista de lucru a managerului pe sezonul în curs: ce grupe sunt propuse pentru
// suspendare și ce grupe se apropie. Decizia se ia din fișa fiecărei grupe.
export function PragMinimPanel({ grupe }: Props) {
  const [observatieOpen, setObservatieOpen] = useState(false)
  const inCurs = grupe.filter((g) => g.sezonInCurs)
  if (inCurs.length === 0) return null

  const deSuspendat = inCurs.filter((g) => g.stare === 'de_suspendat')
  const inObservatie = inCurs.filter((g) => g.stare === 'in_observatie')
  const toateInRodaj = inCurs.every(
    (g) => g.stare === 'in_rodaj' || g.stare === 'suspendat',
  )

  if (deSuspendat.length === 0 && inObservatie.length === 0) {
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
    </section>
  )
}

function GrupaRand({ g, tone }: { g: GrupaPragMinim; tone: 'danger' | 'warn' }) {
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
        <span>{serieSubMinim(g)}</span>
        {g.cursantiLunaCurenta != null && (
          <span>
            luna asta {g.cursantiLunaCurenta}/{g.minim}
          </span>
        )}
        <Badge tone={tone}>
          {g.luniSubConsecutive === 1 ? '1 lună' : `${g.luniSubConsecutive} luni`}
        </Badge>
      </div>
    </li>
  )
}
