import { useRef } from 'react'
import { cn } from '@/lib/cn'
import type { EditableField } from './useTemplateEditorState'
import type { TemplateField } from '../types'

const TYPE_BORDER: Record<TemplateField['type'], string> = {
  text: 'border-dashed border-blue-400',
  date: 'border-dashed border-purple-400',
  checkbox: 'border-solid border-emerald-400',
  signature: 'border-dashed border-orange-400',
  copii_table: 'border-dotted border-slate-400',
}

type Props = {
  field: EditableField
  containerSize: { width: number; height: number }
  selected: boolean
  readOnly: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onResize: (w: number, h: number) => void
}

export function FieldBox({ field, containerSize, selected, readOnly, onSelect, onMove, onResize }: Props) {
  const dragStart = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null)
  const resizeStart = useRef<{ clientX: number; clientY: number; w: number; h: number } | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return
    e.stopPropagation()
    onSelect()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, x: field.x, y: field.y }
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const dx = (e.clientX - dragStart.current.clientX) / containerSize.width
    const dy = (e.clientY - dragStart.current.clientY) / containerSize.height
    onMove(dragStart.current.x + dx, dragStart.current.y + dy)
  }
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function handleResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeStart.current = { clientX: e.clientX, clientY: e.clientY, w: field.w, h: field.h }
  }
  function handleResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeStart.current) return
    e.stopPropagation()
    const dw = (e.clientX - resizeStart.current.clientX) / containerSize.width
    const dh = (e.clientY - resizeStart.current.clientY) / containerSize.height
    onResize(resizeStart.current.w + dw, resizeStart.current.h + dh)
  }
  function handleResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    resizeStart.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.w * 100}%`,
        height: `${field.h * 100}%`,
      }}
      className={cn(
        'select-none overflow-hidden rounded border-2 text-[10px] leading-tight',
        selected ? 'z-10 border-quasar-yellow bg-quasar-yellow/20' : cn('bg-black/5', TYPE_BORDER[field.type]),
        !readOnly && 'cursor-move',
      )}
    >
      <span className="pointer-events-none block truncate px-0.5 text-ink">{field.label}</span>
      {selected && !readOnly && (
        <div
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-tl bg-quasar-yellow"
        />
      )}
    </div>
  )
}
