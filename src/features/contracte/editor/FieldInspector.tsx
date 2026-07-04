import { Button, Checkbox, Field, Select, TextInput } from '@/components/ui'
import { FIELD_SOURCE_OPTIONS, FIELD_TYPE_OPTIONS, type TemplateField } from '../types'
import type { EditableField } from './useTemplateEditorState'

type Props = {
  field: EditableField | null
  pageCount: number
  readOnly: boolean
  onChange: (patch: Partial<TemplateField>) => void
  onDelete: () => void
}

const FONT_SIZE_TYPES: TemplateField['type'][] = ['text', 'date', 'copii_table']

export function FieldInspector({ field, pageCount, readOnly, onChange, onDelete }: Props) {
  if (!field) {
    return (
      <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted-2">
        Selectează un câmp pe canvas pentru a-i edita proprietățile.
      </div>
    )
  }

  const pageOptions = Array.from({ length: pageCount }, (_, i) => ({
    value: String(i + 1),
    label: `Pagina ${i + 1}`,
  }))

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <Field label="Cheie (identificator tehnic)" htmlFor="fi-key">
        <TextInput
          id="fi-key"
          value={field.key}
          disabled={readOnly}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </Field>
      <Field label="Etichetă" htmlFor="fi-label">
        <TextInput
          id="fi-label"
          value={field.label}
          disabled={readOnly}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Tip" htmlFor="fi-type">
        <Select
          id="fi-type"
          value={field.type}
          disabled={readOnly}
          options={FIELD_TYPE_OPTIONS}
          onChange={(e) => onChange({ type: e.target.value as TemplateField['type'] })}
        />
      </Field>
      <Field label="Sursă" htmlFor="fi-source">
        <Select
          id="fi-source"
          value={field.source}
          disabled={readOnly}
          options={FIELD_SOURCE_OPTIONS}
          onChange={(e) => onChange({ source: e.target.value as TemplateField['source'] })}
        />
      </Field>
      <div className="flex gap-4">
        <Checkbox
          label="Obligatoriu"
          checked={!!field.required}
          disabled={readOnly}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
        <Checkbox
          label="Editabil în portal"
          checked={!!field.editable}
          disabled={readOnly}
          onChange={(e) => onChange({ editable: e.target.checked })}
        />
      </div>
      <Field label="Pagina" htmlFor="fi-page">
        <Select
          id="fi-page"
          value={String(field.page)}
          disabled={readOnly}
          options={pageOptions}
          onChange={(e) => onChange({ page: Number(e.target.value) })}
        />
      </Field>
      {FONT_SIZE_TYPES.includes(field.type) && (
        <Field label="Mărime font" htmlFor="fi-fontsize">
          <TextInput
            id="fi-fontsize"
            type="number"
            min={6}
            max={24}
            value={field.fontSize ?? 10}
            disabled={readOnly}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
        </Field>
      )}
      <div className="grid grid-cols-4 gap-2 text-xs text-muted-2">
        <div>x: {field.x.toFixed(3)}</div>
        <div>y: {field.y.toFixed(3)}</div>
        <div>w: {field.w.toFixed(3)}</div>
        <div>h: {field.h.toFixed(3)}</div>
      </div>
      {!readOnly && (
        <Button variant="danger" onClick={onDelete}>
          Șterge câmp
        </Button>
      )}
    </div>
  )
}
