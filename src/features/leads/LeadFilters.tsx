import { TextInput, Select, Button, type SelectOption } from '@/components/ui'
import { GRUPE, GRUPA_LABELS, LOCATII } from './constants'

export type LeadFiltersValue = {
  search: string
  sursa: string
  grupa: string
  locatie: string
}

type Props = {
  value: LeadFiltersValue
  campanii: SelectOption[]
  onChange: (next: LeadFiltersValue) => void
}

export function LeadFilters({ value, campanii, onChange }: Props) {
  const set = (key: keyof LeadFiltersValue, v: string) =>
    onChange({ ...value, [key]: v })

  const hasFilters =
    value.search || value.sursa || value.grupa || value.locatie

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-52">
        <TextInput
          placeholder="Caută nume, telefon…"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>
      <div className="w-44">
        <Select
          placeholder="Toate sursele"
          options={campanii}
          value={value.sursa}
          onChange={(e) => set('sursa', e.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          placeholder="Toate grupele"
          options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
          value={value.grupa}
          onChange={(e) => set('grupa', e.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          placeholder="Toate locațiile"
          options={LOCATII.map((l) => ({ label: l, value: l }))}
          value={value.locatie}
          onChange={(e) => set('locatie', e.target.value)}
        />
      </div>
      {hasFilters && (
        <Button
          variant="secondary"
          onClick={() =>
            onChange({ search: '', sursa: '', grupa: '', locatie: '' })
          }
        >
          Resetează
        </Button>
      )}
    </div>
  )
}
