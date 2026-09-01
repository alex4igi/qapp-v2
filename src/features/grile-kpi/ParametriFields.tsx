import { TextInput } from '@/components/ui'
import type { LinieGrila, ParametruSchema } from './types'

/**
 * Randează numerele proprii unui indicator din `parametri_schema`.
 *
 * Piesa care face reală promisiunea „un prag nou nu cere cod": ziua-termen,
 * cele 21 de zile, fereastra de 30 — toate se editează de aici, fără migrație.
 */
export function ParametriFields({
  schema,
  linie,
  onChange,
  readOnly,
}: {
  schema: ParametruSchema[]
  linie: LinieGrila
  onChange: (parametri: LinieGrila['parametri']) => void
  readOnly?: boolean
}) {
  if (!schema || schema.length === 0) return null

  return (
    <div className="flex flex-wrap gap-3">
      {schema.map((p) => {
        const val = linie.parametri?.[p.cheie] ?? p.default ?? ''
        return (
          <label key={p.cheie} className="text-xs text-muted">
            <span className="mb-0.5 block">
              {p.eticheta}
              {p.unitate && <span className="text-muted-2"> ({p.unitate})</span>}
            </span>
            <TextInput
              type="number"
              step="1"
              min={p.min}
              max={p.max}
              disabled={readOnly}
              className="w-28"
              value={String(val)}
              onChange={(e) =>
                onChange({
                  ...linie.parametri,
                  [p.cheie]: e.target.value === '' ? (p.default ?? 0) : Number(e.target.value),
                })
              }
            />
          </label>
        )
      })}
    </div>
  )
}
