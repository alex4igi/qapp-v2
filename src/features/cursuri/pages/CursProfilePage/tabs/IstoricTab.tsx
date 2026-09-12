import { useMemo, useState } from 'react'
import { Badge, Spinner, TextInput } from '@/components/ui'
import { formatMonth } from '@/lib/format'
import { vineLaLabel } from '@/lib/ultimaPrezenta'
import type { CursIstoricRow } from '../../../api'
import { formatData, fullName } from '../helpers'

type Props = {
  loading: boolean
  rows: CursIstoricRow[]
  cursNume: string
  onRowClick: (clientId: string) => void
}

function luna(iso: string | null): string {
  return iso ? formatMonth(`${iso}-01`) : '—'
}

// Toți cursanții care au trecut vreodată prin grupă — fără fereastră de lună și
// fără fereastra de 180 de zile a „foștilor". Pentru o grupă dintr-un sezon
// încheiat e singura listă care nu iese goală.
export function IstoricTab({ loading, rows, cursNume, onRowClick }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      fullName(r.nume, r.prenume).toLowerCase().includes(q),
    )
  }, [rows, search])

  if (loading)
    return (
      <div className="mt-4">
        <Spinner />
      </div>
    )

  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-quasar-gray">
        Nimeni n-a fost înrolat vreodată la această grupă.
      </p>
    )
  }

  const activi = rows.filter((r) => r.activAcum).length

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-quasar-gray">
          <span className="font-medium text-quasar-black">{rows.length}</span>{' '}
          cursanți au trecut prin grupă · {activi} încă înrolați în luna curentă
        </p>
        <div className="w-60">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută un cursant…"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-quasar-gray">
            <tr>
              <th className="w-10 px-3 py-2 text-right">#</th>
              <th className="px-3 py-2">Nume</th>
              <th className="px-3 py-2">Prima lună</th>
              <th className="px-3 py-2">Ultima lună</th>
              <th className="px-3 py-2 text-right">Luni</th>
              <th className="px-3 py-2 text-right">Prezențe</th>
              <th className="px-3 py-2">Ultima prezență</th>
              <th className="px-3 py-2">Acum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((r, i) => (
              <tr
                key={r.clientId}
                className="cursor-pointer hover:bg-quasar-yellow/10"
                onClick={() => onRowClick(r.clientId)}
              >
                <td className="px-3 py-2 text-right text-quasar-gray">
                  {i + 1}.
                </td>
                <td className="px-3 py-2 font-medium text-quasar-black">
                  {fullName(r.nume, r.prenume)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-quasar-gray">
                  {luna(r.primaLuna)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-quasar-black">
                  {luna(r.ultimaLuna)}
                </td>
                <td className="px-3 py-2 text-right text-quasar-black">
                  {r.luniFacturate}
                </td>
                <td className="px-3 py-2 text-right text-quasar-black">
                  {r.prezente}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-quasar-gray">
                  {formatData(r.ultimaPrezenta)}
                </td>
                <td className="px-3 py-2">
                  {r.activAcum ? (
                    <Badge tone="success">La grupă</Badge>
                  ) : r.vineLa ? (
                    <span className="text-xs font-medium text-green-700">
                      ↪ {vineLaLabel(r.vineLa, cursNume)}
                    </span>
                  ) : (
                    <span className="text-xs text-quasar-gray">Plecat</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="mt-3 text-center text-sm text-quasar-gray">
          Niciun cursant nu se potrivește căutării.
        </p>
      )}
    </div>
  )
}
