import { Field, Select, Spinner, TextInput, type SelectOption } from '@/components/ui'
import type { Tip } from '../helpers'

type Props = {
  sezoaneOptions: SelectOption[]
  sezoaneLoading: boolean
  sursaId: string
  setSursaId: (v: string) => void
  nume: string
  setNume: (v: string) => void
  tip: Tip
  setTip: (v: Tip) => void
  dataIncepere: string
  setDataIncepere: (v: string) => void
  dataFinal: string
  setDataFinal: (v: string) => void
}

export function Step1Detalii({
  sezoaneOptions,
  sezoaneLoading,
  sursaId,
  setSursaId,
  nume,
  setNume,
  tip,
  setTip,
  dataIncepere,
  setDataIncepere,
  dataFinal,
  setDataFinal,
}: Props) {
  return (
    <div className="space-y-3">
      <Field label="Sezon sursă" required>
        {sezoaneLoading ? (
          <Spinner />
        ) : (
          <Select
            options={sezoaneOptions}
            value={sursaId}
            onChange={(e) => setSursaId(e.target.value)}
          />
        )}
      </Field>
      <Field label="Nume sezon nou" required>
        <TextInput
          value={nume}
          onChange={(e) => setNume(e.target.value)}
          placeholder="Sezon 2026-2027"
        />
      </Field>
      <Field label="Tip">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="tip"
              value="principal"
              checked={tip === 'principal'}
              onChange={() => setTip('principal')}
            />
            Principal (toate cursurile)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="tip"
              value="extra"
              checked={tip === 'extra'}
              onChange={() => setTip('extra')}
            />
            Extra (doar facultative)
          </label>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data început" required>
          <TextInput
            type="date"
            value={dataIncepere}
            onChange={(e) => setDataIncepere(e.target.value)}
          />
        </Field>
        <Field label="Data final" required>
          <TextInput
            type="date"
            value={dataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
          />
        </Field>
      </div>
    </div>
  )
}
