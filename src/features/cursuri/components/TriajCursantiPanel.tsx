import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { formatMonth } from '@/lib/format'
import { cursuriOptions } from '@/lib/lookups'
import {
  getCursantiAfectatiDeSuspendare,
  type TriajSuspendare,
} from '../api'

type Props = {
  cursId: string
  /** Locația și sezonul cursului — pentru lista de grupe în care se poate muta. */
  locatieId: string | null
  sezonId: string | null
  dinLuna: string
  triaj: TriajSuspendare
  onChange: (t: TriajSuspendare) => void
}

const OPTIUNI: { tip: TriajSuspendare['tip']; label: string; hint: string }[] = [
  {
    tip: 'nimic',
    label: 'Nu-i atinge',
    hint: 'Rămân înrolați, cu ratele curgând. Decizi din fișa fiecăruia.',
  },
  {
    tip: 'muta',
    label: 'Mută-i pe toți la altă grupă',
    hint: 'Seria întreagă din luna suspendării încolo. Banii încasați nu se mișcă.',
  },
  {
    tip: 'reziliaza',
    label: 'Reziliază-le înrolările',
    hint: 'Din luna suspendării încolo. Lunile dinainte rămân cum sunt.',
  },
  {
    tip: 'scuteste',
    label: 'Scutește-le luna suspendată',
    hint: 'Rămân în grupă, dar nu datorează lunile oprite. Ce au plătit deja rămâne credit.',
  },
]

// Suspendarea nu atinge înrolările de la sine: ratele ar curge mai departe pe
// luni în care grupa nu se ține, restanțele s-ar aduna, iar cronul de 50 de zile
// le-ar putea anula locul. De aici alegerea, explicită, la fiecare oprire.
export function TriajCursantiPanel({
  cursId,
  locatieId,
  sezonId,
  dinLuna,
  triaj,
  onChange,
}: Props) {
  const afectatiQ = useQuery({
    queryKey: ['curs', cursId, 'cursanti-afectati', dinLuna],
    queryFn: () => getCursantiAfectatiDeSuspendare(cursId, dinLuna),
  })

  const cursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri', locatieId, sezonId],
    queryFn: () => cursuriOptions(locatieId, sezonId),
    enabled: triaj.tip === 'muta',
  })

  const tinteOptions = useMemo(
    () => (cursuriQ.data ?? []).filter((o) => o.value !== cursId),
    [cursuriQ.data, cursId],
  )

  const afectati = afectatiQ.data ?? []

  if (afectatiQ.isLoading) return <Spinner />
  if (afectati.length === 0) {
    return (
      <p className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted-2">
        Niciun cursant înrolat din {formatMonth(dinLuna)} încolo — nu e nimic de
        hotărât.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-bold text-ink">
        {afectati.length}{' '}
        {afectati.length === 1 ? 'cursant înrolat' : 'cursanți înrolați'} din{' '}
        {formatMonth(dinLuna)} încolo
      </p>
      <p className="mt-1 text-xs text-muted-2">
        {afectati
          .slice(0, 6)
          .map((c) => `${c.nume} ${c.prenume ?? ''}`.trim())
          .join(', ')}
        {afectati.length > 6 ? ` și încă ${afectati.length - 6}` : ''}
      </p>

      <div className="mt-3 space-y-2">
        {OPTIUNI.map((o) => (
          <label
            key={o.tip}
            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-quasar-yellow/5"
          >
            <input
              type="radio"
              name="triaj-suspendare"
              className="mt-0.5"
              checked={triaj.tip === o.tip}
              onChange={() =>
                onChange(
                  o.tip === 'muta'
                    ? { tip: 'muta', cursNouId: '' }
                    : ({ tip: o.tip } as TriajSuspendare),
                )
              }
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-muted-2">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {triaj.tip === 'muta' && (
        <div className="mt-2">
          <Field label="Grupa în care se mută" required htmlFor="triaj-curs-nou">
            <Select
              id="triaj-curs-nou"
              placeholder="— alege grupa —"
              options={tinteOptions}
              value={triaj.cursNouId}
              onChange={(e) =>
                onChange({ tip: 'muta', cursNouId: e.target.value })
              }
            />
          </Field>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-2">
        Excepțiile individuale se rezolvă în continuare din fișa fiecărui client.
      </p>
    </div>
  )
}
