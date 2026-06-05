import { Spinner, TextInput } from '@/components/ui'
import type { CursRow, Tip } from '../helpers'

type Props = {
  loading: boolean
  tip: Tip
  cursuri: CursRow[]
  setCursuri: (c: CursRow[]) => void
}

export function Step2Cursuri({ loading, tip, cursuri, setCursuri }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-quasar-gray">
        {tip === 'extra'
          ? 'Extra-sezon: afișează doar cursurile facultative din sursă.'
          : 'Toate cursurile din sezonul sursă. Bifează cele de clonat; poți edita nume / preț lunar / capacitate.'}
      </p>
      {loading ? (
        <Spinner />
      ) : cursuri.length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun curs eligibil în sezonul sursă.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded border border-quasar-gray/30">
          <table className="min-w-full text-sm">
            <thead className="bg-quasar-gray/10 text-left text-xs uppercase">
              <tr>
                <th className="w-10 px-2 py-2"></th>
                <th className="px-2 py-2">Nume</th>
                <th className="w-24 px-2 py-2">Vârstă</th>
                <th className="w-16 px-2 py-2">Fac.</th>
                <th className="w-28 px-2 py-2">Preț lunar</th>
                <th className="w-24 px-2 py-2">Capac.</th>
              </tr>
            </thead>
            <tbody>
              {cursuri.map((c, idx) => (
                <tr key={c.sursa.id} className="border-t border-quasar-gray/20">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) => {
                        const next = [...cursuri]
                        next[idx] = { ...c, selected: e.target.checked }
                        setCursuri(next)
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput
                      value={c.numele}
                      onChange={(e) => {
                        const next = [...cursuri]
                        next[idx] = { ...c, numele: e.target.value }
                        setCursuri(next)
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-quasar-gray">
                    {c.sursa.varsta ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-xs">
                    {c.sursa.facultativ ? 'Da' : 'Nu'}
                  </td>
                  <td className="px-2 py-1">
                    <TextInput
                      type="number"
                      value={c.pret_lunar}
                      onChange={(e) => {
                        const next = [...cursuri]
                        next[idx] = { ...c, pret_lunar: e.target.value }
                        setCursuri(next)
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <TextInput
                      type="number"
                      value={c.capacitate_maxima}
                      onChange={(e) => {
                        const next = [...cursuri]
                        next[idx] = {
                          ...c,
                          capacitate_maxima: e.target.value,
                        }
                        setCursuri(next)
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
