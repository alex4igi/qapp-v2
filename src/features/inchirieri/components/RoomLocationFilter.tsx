import { useQuery } from '@tanstack/react-query'
import { Field, Select } from '@/components/ui'
import { locatiiOptions, saliOptions } from '@/lib/lookups'

type Props = {
  locatie: string
  sala: string
  onLocatie: (id: string) => void
  onSala: (id: string) => void
}

export function RoomLocationFilter({ locatie, sala, onLocatie, onSala }: Props) {
  const locatiiQ = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const saliQ = useQuery({
    queryKey: ['lookup', 'sali', locatie],
    queryFn: () => saliOptions(locatie),
    enabled: Boolean(locatie),
  })

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">
        <Field label="Locație">
          <Select
            options={locatiiQ.data ?? []}
            value={locatie}
            onChange={(e) => {
              onLocatie(e.target.value)
              onSala('')
            }}
            placeholder="Alege locația…"
          />
        </Field>
      </div>
      <div className="w-48">
        <Field label="Sală">
          <Select
            options={saliQ.data ?? []}
            value={sala}
            onChange={(e) => onSala(e.target.value)}
            placeholder={locatie ? 'Alege sala…' : 'Alege locația'}
          />
        </Field>
      </div>
    </div>
  )
}
