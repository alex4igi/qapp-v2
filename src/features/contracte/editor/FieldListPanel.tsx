import { cn } from '@/lib/cn'
import { FIELD_TYPE_LABEL } from '../constants'
import type { EditableField } from './useTemplateEditorState'

type Props = {
  fields: EditableField[]
  selectedFieldId: string | null
  onSelect: (id: string, page: number) => void
}

// Câmpurile de pe alte pagini nu apar pe canvas — fără lista asta ar fi
// inaccesibile (nu poți selecta/edita ce nu vezi).
export function FieldListPanel({ fields, selectedFieldId, onSelect }: Props) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-2">Niciun câmp încă.</p>
  }
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto">
      {fields.map((f) => (
        <li key={f._id}>
          <button
            type="button"
            onClick={() => onSelect(f._id, f.page)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm',
              f._id === selectedFieldId ? 'bg-quasar-yellow/30 text-ink' : 'text-ink hover:bg-surface',
            )}
          >
            <span className="truncate">{f.label || f.key}</span>
            <span className="ml-2 shrink-0 text-xs text-muted-2">
              {FIELD_TYPE_LABEL[f.type] ?? f.type} · p.{f.page}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
