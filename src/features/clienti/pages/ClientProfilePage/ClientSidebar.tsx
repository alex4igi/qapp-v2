import { Link } from 'react-router-dom'
import { Button, Select } from '@/components/ui'
import { DetailRow } from './helpers'

type Props = {
  initials: string
  nume: string
  prenume: string | null
  varsta: number | null
  familia: string
  familiaId: string | null
  sezoaneOptions: { value: string; label: string }[]
  sezonValue: string
  onSezonChange: (id: string) => void
  cursuri: { id: string; nume: string }[]
  onEnroll: () => void
}

export function ClientSidebar({
  initials,
  nume,
  prenume,
  varsta,
  familia,
  familiaId,
  sezoaneOptions,
  sezonValue,
  onSezonChange,
  cursuri,
  onEnroll,
}: Props) {
  return (
    <aside className="rounded-lg border border-quasar-gray-light bg-white p-4">
      <div className="mb-3 flex justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-quasar-yellow text-3xl font-bold text-quasar-black">
          {initials}
        </div>
      </div>
      <h2 className="text-center text-lg font-bold text-quasar-black">
        {nume} {prenume ?? ''}
      </h2>
      <dl className="mt-4 space-y-3">
        <DetailRow label="Vârsta" value={varsta != null ? String(varsta) : ''} />
        <DetailRow
          label="Familia"
          value={familia}
          to={familiaId ? `/familii/${familiaId}` : undefined}
        />
        <div>
          <dt className="mb-1 text-xs font-medium text-quasar-gray">
            În sezonul
          </dt>
          <Select
            options={sezoaneOptions}
            value={sezonValue}
            onChange={(e) => onSezonChange(e.target.value)}
            placeholder={sezoaneOptions.length ? undefined : '— nu există sezoane —'}
          />
        </div>
        <div>
          <dt className="mb-1 text-xs font-medium text-quasar-gray">Cursuri</dt>
          {cursuri.length === 0 ? (
            <p className="text-sm text-quasar-gray">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {cursuri.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/cursuri/${c.id}`}
                    className="text-quasar-black hover:text-quasar-gray hover:underline"
                  >
                    {c.nume}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dl>
      <Button className="mt-4 w-full" onClick={onEnroll}>
        + Înrolează
      </Button>
    </aside>
  )
}
