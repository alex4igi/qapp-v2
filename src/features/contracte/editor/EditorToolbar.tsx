import { useState } from 'react'
import { Badge, Button, Select } from '@/components/ui'
import { FIELD_TYPE_OPTIONS, type TemplateField } from '../types'

const ZOOM_OPTIONS = [
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: '1.25', label: '125%' },
  { value: '1.5', label: '150%' },
]

type Props = {
  currentPage: number
  pageCount: number
  onPageChange: (page: number) => void
  scale: number
  onScaleChange: (scale: number) => void
  readOnly: boolean
  dirty: boolean
  saving: boolean
  onAddField: (type: TemplateField['type']) => void
  onSave: () => void
  locked: boolean
  onCreateNewVersion: () => void
  activ: boolean
  onActivate: () => void
}

export function EditorToolbar({
  currentPage,
  pageCount,
  onPageChange,
  scale,
  onScaleChange,
  readOnly,
  dirty,
  saving,
  onAddField,
  onSave,
  locked,
  onCreateNewVersion,
  activ,
  onActivate,
}: Props) {
  const [newFieldType, setNewFieldType] = useState<TemplateField['type']>('text')

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3">
      <div className="flex items-center gap-1">
        <Button variant="secondary" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          ◂
        </Button>
        <span className="min-w-[90px] text-center text-sm text-muted-2">
          Pagina {currentPage} / {pageCount}
        </span>
        <Button
          variant="secondary"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          ▸
        </Button>
      </div>

      <Select
        value={String(scale)}
        onChange={(e) => onScaleChange(Number(e.target.value))}
        options={ZOOM_OPTIONS}
        className="w-24"
      />

      {locked ? (
        <Badge tone="warn">Blocat (trimis deja)</Badge>
      ) : (
        <Badge tone={activ ? 'success' : 'neutral'}>{activ ? 'Activ' : 'Inactiv'}</Badge>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Select
            value={newFieldType}
            onChange={(e) => setNewFieldType(e.target.value as TemplateField['type'])}
            options={FIELD_TYPE_OPTIONS}
            className="w-40"
          />
          <Button variant="secondary" onClick={() => onAddField(newFieldType)}>
            Adaugă câmp
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {dirty && !readOnly && <span className="text-xs text-muted-2">Nesalvat</span>}
        {locked ? (
          <Button onClick={onCreateNewVersion}>Creează versiune nouă</Button>
        ) : (
          <>
            {!activ && <Button variant="secondary" onClick={onActivate}>Activează</Button>}
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving ? 'Se salvează…' : 'Salvează'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
