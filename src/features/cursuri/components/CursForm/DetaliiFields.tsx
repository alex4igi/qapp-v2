import { Field, Select, TextInput, type SelectOption } from '@/components/ui'
import { stilCursOptions, varstaCursOptions } from '@/lib/enums'
import { nivelFaraTrupa, tipCursOptions, type FormState, type SetField, type TipCurs } from './helpers'

type Props = {
  form: FormState
  set: SetField
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  teacheri: SelectOption[]
  coInstructorOptions: SelectOption[]
}

// Câmpurile de identitate ale cursului: nume, stil, tip, nivel, grupa de
// vârstă, teacherul principal și co-instructorul.
export function DetaliiFields({
  form,
  set,
  setForm,
  teacheri,
  coInstructorOptions,
}: Props) {
  const isTrupa = form.tip === 'recurent-trupa'

  // Cursurile din sezoanele vechi pot avea un stil în afara vocabularului; îl
  // ținem ca opțiune, altfel selectul l-ar rescrie tăcut la prima salvare.
  const stiluri =
    !form.stil || stilCursOptions.some((o) => o.value === form.stil)
      ? stilCursOptions
      : [...stilCursOptions, { label: form.stil, value: form.stil }]

  const onTipChange = (next: TipCurs) => {
    setForm((prev) => ({
      ...prev,
      tip: next,
      // dacă trecem la Trupă, ștergem nivelul (devine implicit 'Trupa' la save)
      // dacă plecăm de la Trupă, lăsăm gol să aleagă userul
      nivelul: next === 'recurent-trupa' ? '' : prev.nivelul,
    }))
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nume curs" required htmlFor="numele">
          <TextInput
            id="numele"
            value={form.numele}
            onChange={(e) => set('numele', e.target.value)}
          />
        </Field>
        <Field label="Stil" htmlFor="stil">
          <Select
            id="stil"
            placeholder="—"
            options={stiluri}
            value={form.stil}
            onChange={(e) => set('stil', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tip curs" required htmlFor="tip">
          <Select
            id="tip"
            options={tipCursOptions}
            value={form.tip}
            onChange={(e) => onTipChange(e.target.value as TipCurs)}
          />
        </Field>
        <Field label="Nivel" htmlFor="nivelul">
          <Select
            id="nivelul"
            placeholder={isTrupa ? 'Trupă' : '—'}
            options={nivelFaraTrupa}
            value={form.nivelul}
            onChange={(e) => set('nivelul', e.target.value)}
            disabled={isTrupa}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Grupă vârstă" htmlFor="varsta">
          <Select
            id="varsta"
            placeholder="—"
            options={varstaCursOptions}
            value={form.varsta}
            onChange={(e) => set('varsta', e.target.value)}
          />
        </Field>
        <Field label="Teacher principal" htmlFor="teacher">
          <Select
            id="teacher"
            placeholder="—"
            options={teacheri}
            value={form.teacher}
            onChange={(e) => {
              const next = e.target.value
              setForm((prev) => ({
                ...prev,
                teacher: next,
                coInstructor:
                  next && prev.coInstructor === next ? '' : prev.coInstructor,
              }))
            }}
          />
        </Field>
      </div>

      <Field label="Co-instructor (opțional)" htmlFor="co-instructor">
        <Select
          id="co-instructor"
          placeholder={
            form.teacher
              ? '— niciun co-instructor —'
              : '— alege întâi teacherul principal —'
          }
          options={coInstructorOptions}
          value={form.coInstructor}
          onChange={(e) => set('coInstructor', e.target.value)}
          disabled={!form.teacher}
        />
        <p className="mt-1 text-xs text-quasar-gray">
          Salariul se calculează doar pentru teacherul principal.
          Co-instructorul poate marca prezența și completa evaluări.
        </p>
      </Field>
    </>
  )
}
