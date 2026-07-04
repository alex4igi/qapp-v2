import { useCallback, useMemo, useState } from 'react'
import { FIELD_DEFAULT_FONT_SIZE, FIELD_DEFAULT_SIZE, type TemplateField } from '../types'

// `_id` e un id sintetic client-side (nu ține de `key`-ul de business, care
// poate fi editat/dublat temporar în timp ce se lucrează) — folosit pt. selecție
// și React keys. Se elimină din payload la salvare (`fieldsForSave`).
export type EditableField = TemplateField & { _id: string }

function genId(): string {
  return crypto.randomUUID()
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}

export function useTemplateEditorState(initialFields: TemplateField[] = []) {
  const [fields, setFields] = useState<EditableField[]>(() =>
    initialFields.map((f) => ({ ...f, _id: genId() })),
  )
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [dirty, setDirty] = useState(false)

  const loadFields = useCallback((next: TemplateField[]) => {
    setFields(next.map((f) => ({ ...f, _id: genId() })))
    setSelectedFieldId(null)
    setDirty(false)
  }, [])

  const addField = useCallback(
    (type: TemplateField['type']) => {
      const size = FIELD_DEFAULT_SIZE[type]
      const id = genId()
      const field: EditableField = {
        _id: id,
        key: `camp_${fields.length + 1}`,
        label: 'Câmp nou',
        type,
        source: type === 'date' ? 'azi' : 'manual',
        required: false,
        editable: true,
        page: currentPage,
        x: 0.35,
        y: 0.45,
        w: size.w,
        h: size.h,
        fontSize: type === 'text' || type === 'date' ? FIELD_DEFAULT_FONT_SIZE : undefined,
      }
      setFields((prev) => [...prev, field])
      setSelectedFieldId(id)
      setDirty(true)
    },
    [fields.length, currentPage],
  )

  const updateField = useCallback((id: string, patch: Partial<TemplateField>) => {
    setFields((prev) => prev.map((f) => (f._id === id ? { ...f, ...patch } : f)))
    setDirty(true)
  }, [])

  const moveField = useCallback((id: string, x: number, y: number) => {
    setFields((prev) =>
      prev.map((f) => (f._id === id ? { ...f, x: clamp(x, 0, 1 - f.w), y: clamp(y, 0, 1 - f.h) } : f)),
    )
    setDirty(true)
  }, [])

  const resizeField = useCallback((id: string, w: number, h: number) => {
    setFields((prev) =>
      prev.map((f) =>
        f._id === id ? { ...f, w: clamp(w, 0.01, 1 - f.x), h: clamp(h, 0.01, 1 - f.y) } : f,
      ),
    )
    setDirty(true)
  }, [])

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f._id !== id))
    setSelectedFieldId((cur) => (cur === id ? null : cur))
    setDirty(true)
  }, [])

  const fieldsForSave = useMemo<TemplateField[]>(
    () => fields.map(({ _id: _omit, ...f }) => f),
    [fields],
  )

  const fieldsOnCurrentPage = useMemo(
    () => fields.filter((f) => f.page === currentPage),
    [fields, currentPage],
  )

  const selectedField = useMemo(
    () => fields.find((f) => f._id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  )

  return {
    fields,
    fieldsOnCurrentPage,
    fieldsForSave,
    selectedFieldId,
    selectedField,
    currentPage,
    scale,
    dirty,
    setCurrentPage,
    setScale,
    setSelectedFieldId,
    loadFields,
    addField,
    updateField,
    moveField,
    resizeField,
    removeField,
    markSaved: () => setDirty(false),
  }
}
