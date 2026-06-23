import { DateInput, Field, Select, Spinner, TextInput, type SelectOption } from '@/components/ui'
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
  scadentaPrimaRata: string
  setScadentaPrimaRata: (v: string) => void
  scadentaUltimaRata: string
  setScadentaUltimaRata: (v: string) => void
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
  scadentaPrimaRata,
  setScadentaPrimaRata,
  scadentaUltimaRata,
  setScadentaUltimaRata,
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
          <DateInput
            value={dataIncepere}
            onChange={(e) => setDataIncepere(e.target.value)}
          />
        </Field>
        <Field label="Data final" required>
          <DateInput
            value={dataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scadență prima rată">
          <DateInput
            value={scadentaPrimaRata}
            onChange={(e) => setScadentaPrimaRata(e.target.value)}
          />
        </Field>
        <Field label="Scadență ultima rată">
          <DateInput
            value={scadentaUltimaRata}
            onChange={(e) => setScadentaUltimaRata(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs text-quasar-gray">
        Termenele de plată ale primei (luna de început, ex. sept.) și ultimei rate
        (luna de final, ex. iunie). Necompletate = ziua 15, le poți pune și mai târziu
        din editarea sezonului.
      </p>
    </div>
  )
}
