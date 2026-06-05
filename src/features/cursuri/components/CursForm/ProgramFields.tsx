import {
  CheckboxGroup,
  Field,
  Select,
  TextInput,
  type SelectOption,
} from '@/components/ui'
import { zileOptions } from '@/lib/enums'
import type { FormState, SetField } from './helpers'

type Props = {
  form: FormState
  set: SetField
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  locatii: SelectOption[]
  sezoane: SelectOption[]
  saliOptions: SelectOption[]
  allSali: Array<{ id: string; locatie: string | null }>
}

// Câmpurile de program ale cursului: locație, sală, sezon + zile + oră + durată.
// Schimbarea locației resetează sala dacă nu mai aparține de noua locație.
export function ProgramFields({
  form,
  set,
  setForm,
  locatii,
  sezoane,
  saliOptions,
  allSali,
}: Props) {
  const onLocatieChange = (next: string) => {
    setForm((prev) => {
      const current = allSali.find((s) => s.id === prev.sala)
      const keepSala =
        !next || (current && current.locatie === next) ? prev.sala : ''
      return { ...prev, locatie: next, sala: keepSala }
    })
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Locație" htmlFor="locatie">
          <Select
            id="locatie"
            placeholder="—"
            options={locatii}
            value={form.locatie}
            onChange={(e) => onLocatieChange(e.target.value)}
          />
        </Field>
        <Field label="Sală" htmlFor="sala">
          <Select
            id="sala"
            placeholder="—"
            options={saliOptions}
            value={form.sala}
            onChange={(e) => set('sala', e.target.value)}
          />
        </Field>
        <Field label="Sezon" htmlFor="sezon">
          <Select
            id="sezon"
            placeholder="—"
            options={sezoane}
            value={form.sezon}
            onChange={(e) => set('sezon', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Zile">
        <CheckboxGroup
          options={zileOptions}
          value={form.zile}
          onChange={(zile) => set('zile', zile)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ora" htmlFor="ora">
          <TextInput
            id="ora"
            placeholder="17:00"
            value={form.ora}
            onChange={(e) => set('ora', e.target.value)}
          />
        </Field>
        <Field label="Durată (min)" htmlFor="durata">
          <TextInput
            id="durata"
            type="number"
            min={0}
            value={form.durata_cursului}
            onChange={(e) => set('durata_cursului', e.target.value)}
          />
        </Field>
      </div>
    </>
  )
}
