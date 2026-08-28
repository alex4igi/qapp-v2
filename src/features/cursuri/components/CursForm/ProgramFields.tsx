import { useCallback } from 'react'
import {
  Checkbox,
  CheckboxGroup,
  Field,
  Select,
  TextInput,
  type SelectOption,
} from '@/components/ui'
import { zileOptions } from '@/lib/enums'
import { ProgramPicker } from '@/features/metodologic/components/ProgramPicker'
import type { FormState, SetField } from './helpers'

type Props = {
  form: FormState
  set: SetField
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  locatii: SelectOption[]
  sezoane: SelectOption[]
  saliOptions: SelectOption[]
  allSali: Array<{ id: string; locatie: string | null }>
  // Gard afișat sub selectorul de sezon când grupa mutată are deja prezențe.
  avertismentSezon?: React.ReactNode
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
  avertismentSezon,
}: Props) {
  const onLocatieChange = (next: string) => {
    setForm((prev) => {
      const current = allSali.find((s) => s.id === prev.sala)
      const keepSala =
        !next || (current && current.locatie === next) ? prev.sala : ''
      return { ...prev, locatie: next, sala: keepSala }
    })
  }

  // Programele metodologice sunt ancorate pe eticheta text a sezonului, nu pe id.
  const sezonEticheta = sezoane.find((s) => s.value === form.sezon)?.label ?? null
  const setProgram = useCallback(
    (id: string) => setForm((prev) => ({ ...prev, program_metodologic: id })),
    [setForm],
  )

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

      {avertismentSezon}

      <Field label="Zile">
        <CheckboxGroup
          options={zileOptions}
          value={form.zile}
          onChange={(zile) => set('zile', zile)}
        />
      </Field>

      <Checkbox
        id="orar-diferit"
        label="Orar diferit pe zile (ex. Luni 17:00, Vineri 18:00)"
        checked={form.orarDiferit}
        onChange={(e) => set('orarDiferit', e.target.checked)}
      />

      <div className="grid grid-cols-2 gap-3">
        {form.orarDiferit ? (
          <Field label="Ora pe zi">
            {form.zile.length ? (
              <div className="space-y-2">
                {form.zile.map((zi) => (
                  <div key={zi} className="flex items-center gap-2">
                    <span className="w-20 text-sm text-quasar-black">{zi}</span>
                    <TextInput
                      placeholder="17:00"
                      value={form.orePeZi[zi] ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          orePeZi: { ...prev.orePeZi, [zi]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-quasar-gray">Selectează întâi zilele.</p>
            )}
          </Field>
        ) : (
          <Field label="Ora" htmlFor="ora">
            <TextInput
              id="ora"
              placeholder="17:00"
              value={form.ora}
              onChange={(e) => set('ora', e.target.value)}
            />
          </Field>
        )}
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

      <ProgramPicker
        sezonEticheta={sezonEticheta}
        nivelul={form.nivelul || null}
        varsta={form.varsta || null}
        zile={form.zile}
        value={form.program_metodologic}
        onChange={setProgram}
      />

      <Field label="Link grup WhatsApp" htmlFor="link_whatsapp">
        <TextInput
          id="link_whatsapp"
          placeholder="https://chat.whatsapp.com/…"
          value={form.link_whatsapp}
          onChange={(e) => set('link_whatsapp', e.target.value)}
        />
      </Field>
    </>
  )
}
