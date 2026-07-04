import { Field, Combobox, TextInput, type SelectOption } from '@/components/ui'

type Props = {
  tip: string
  sezonId: string | null
  nume: string
  versiune: number
  valabilitateZile: number
  sezonOptions: SelectOption[]
  tipSuggestions: string[]
  disabled: boolean
  onTipChange: (tip: string) => void
  onSezonChange: (sezonId: string | null) => void
  onNumeChange: (nume: string) => void
  onValabilitateChange: (zile: number) => void
}

export function TemplateMetaForm({
  tip,
  sezonId,
  nume,
  versiune,
  valabilitateZile,
  sezonOptions,
  tipSuggestions,
  disabled,
  onTipChange,
  onSezonChange,
  onNumeChange,
  onValabilitateChange,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-5">
      <Field label="Tip (liber — scrie unul nou sau alege dintre cele existente)" htmlFor="tmf-tip">
        <TextInput
          id="tmf-tip"
          list="tmf-tip-suggestions"
          value={tip}
          disabled={disabled}
          onChange={(e) => onTipChange(e.target.value)}
        />
        <datalist id="tmf-tip-suggestions">
          {tipSuggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Sezon" htmlFor="tmf-sezon">
        <Combobox
          id="tmf-sezon"
          value={sezonId ?? ''}
          disabled={disabled}
          options={sezonOptions}
          placeholder="Fără sezon"
          onChange={(v) => onSezonChange(v || null)}
        />
      </Field>
      <Field label="Nume șablon" htmlFor="tmf-nume">
        <TextInput
          id="tmf-nume"
          value={nume}
          disabled={disabled}
          onChange={(e) => onNumeChange(e.target.value)}
        />
      </Field>
      <Field label="Versiune">
        <TextInput value={versiune} disabled readOnly />
      </Field>
      <Field label="Valabilitate link (zile)" htmlFor="tmf-valabilitate">
        <TextInput
          id="tmf-valabilitate"
          type="number"
          min={1}
          value={valabilitateZile}
          disabled={disabled}
          onChange={(e) => onValabilitateChange(Number(e.target.value))}
        />
      </Field>
    </div>
  )
}
