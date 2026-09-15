import { DateInput, Field, Pills, Select, TextInput } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { categorieIncasareOptions, metodaPlataOptions } from '@/lib/enums'
import { PERIOADE, type Perioada } from '../perioada'

type Props = {
  search: string
  onSearch: (v: string) => void
  perioada: Perioada
  onPerioada: (p: Perioada) => void
  interval: { from: string; to: string }
  onInterval: (i: { from: string; to: string }) => void
  locatieId: string
  onLocatie: (v: string) => void
  locatiiOptions: SelectOption[]
  categorie: string
  onCategorie: (v: string) => void
  metoda: string
  onMetoda: (v: string) => void
}

export function PlatiFiltreBar(p: Props) {
  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Caută" htmlFor="plati-search">
            <TextInput
              id="plati-search"
              placeholder="Client, curs, eveniment, observații…"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="plati-loc">
            <Select
              id="plati-loc"
              placeholder="Toate locațiile"
              options={p.locatiiOptions}
              value={p.locatieId}
              onChange={(e) => p.onLocatie(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Categorie" htmlFor="plati-cat">
            <Select
              id="plati-cat"
              placeholder="Toate"
              options={categorieIncasareOptions}
              value={p.categorie}
              onChange={(e) => p.onCategorie(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Metodă" htmlFor="plati-metoda">
            <Select
              id="plati-metoda"
              placeholder="Toate"
              options={metodaPlataOptions}
              value={p.metoda}
              onChange={(e) => p.onMetoda(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Pills
          aria-label="Perioadă"
          options={PERIOADE}
          value={p.perioada}
          onChange={(v) => p.onPerioada(v as Perioada)}
          clearable={false}
        />
        {p.perioada === 'interval' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <DateInput
                aria-label="De la"
                value={p.interval.from}
                onChange={(e) => p.onInterval({ ...p.interval, from: e.target.value })}
              />
            </div>
            <span className="text-sm text-quasar-gray">–</span>
            <div className="w-40">
              <DateInput
                aria-label="Până la"
                value={p.interval.to}
                onChange={(e) => p.onInterval({ ...p.interval, to: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
