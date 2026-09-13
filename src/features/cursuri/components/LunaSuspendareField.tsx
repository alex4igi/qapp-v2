import { useMemo } from 'react'
import { Field, Select } from '@/components/ui'
import { formatMonth } from '@/lib/format'

export const lunaCurentaIso = () =>
  `${new Date().toISOString().slice(0, 7)}-01`

const addMonths = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.toISOString().slice(0, 7)}-01`
}

type Props = {
  value: string
  onChange: (luna: string) => void
  /** Suspendare = prima lună neplătită. Re-activare = luna în care repornește. */
  mod: 'suspendare' | 'reactivare'
  /** La re-activare: luna suspendării. Nu se poate reporni din ea sau dinainte. */
  minExclusiv?: string | null
}

// Luna e granularitatea suspendării: salariul se calculează pe lună, deci o
// grupă oprită pe 15 septembrie nu se plătește pentru septembrie deloc (decizie
// explicită: fără prorata).
export function LunaSuspendareField({ value, onChange, mod, minExclusiv }: Props) {
  const acum = lunaCurentaIso()

  const optiuni = useMemo(() => {
    const start = addMonths(acum, -2)
    const luni: string[] = []
    for (let i = 0; i < 9; i++) luni.push(addMonths(start, i))
    return luni
      .filter((l) => !minExclusiv || l > minExclusiv)
      .map((l) => ({
        value: l,
        label:
          formatMonth(l) +
          (l === acum ? ' (luna curentă)' : l < acum ? ' — în trecut' : ''),
      }))
  }, [acum, minExclusiv])

  const eTrecut = value < acum

  return (
    <Field
      label={
        mod === 'suspendare'
          ? 'Din ce lună se suspendă (prima lună neplătită)'
          : 'Din ce lună repornește'
      }
      required
      htmlFor="luna-suspendare"
    >
      <Select
        id="luna-suspendare"
        options={optiuni}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-muted-2">
        {mod === 'suspendare'
          ? 'Luna aleasă și cele de după nu intră în salariul instructorului, indiferent câte ședințe s-au ținut în ea. Lunile dinainte rămân neatinse.'
          : 'Luna aleasă și cele de după revin în salariu. Lunile de pauză rămân neplătite.'}
      </p>
      {eTrecut && (
        <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          ⚠️ Lună din trecut — salariile deja calculate pentru ea se schimbă.
        </p>
      )}
    </Field>
  )
}
