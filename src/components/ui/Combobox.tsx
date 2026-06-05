import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import type { SelectOption } from './Select'

type Props = {
  options: SelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
  allowClear?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = '— alege —',
  className,
  id,
  disabled,
  allowClear = true,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const label = o.label.toLowerCase()
      const sec = (o.secondary ?? '').toLowerCase()
      return label.includes(q) || sec.includes(q)
    })
  }, [options, query])

  useEffect(() => {
    if (hi >= filtered.length) setHi(0)
  }, [filtered, hi])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (val: string) => {
    onChange(val)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const clear = () => {
    onChange('')
    setQuery('')
    inputRef.current?.focus()
  }

  // Când e închis și ai selecție → arată label-ul selectat
  // Când e deschis → arată query (pentru filtrare)
  const displayValue = open ? query : selected?.label ?? ''

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          setHi(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHi(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHi((h) => Math.min(h + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && filtered[hi]) {
              e.preventDefault()
              pick(filtered[hi].value)
            }
          } else if (e.key === 'Backspace' && !query && selected) {
            clear()
          }
        }}
        className={cn(
          'w-full rounded-md border border-quasar-gray-light bg-white px-3 py-2 pr-9 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow disabled:bg-quasar-gray-light',
        )}
      />

      {allowClear && selected && !open && !disabled && (
        <button
          type="button"
          onClick={clear}
          aria-label="Șterge selecția"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-quasar-gray hover:bg-quasar-gray-light hover:text-quasar-black"
        >
          ✕
        </button>
      )}
      {(!selected || open) && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-quasar-gray">
          ▾
        </span>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-quasar-gray-light bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-quasar-gray">
              Niciun rezultat.
            </div>
          ) : (
            <ul role="listbox">
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(o.value)
                  }}
                  onMouseEnter={() => setHi(i)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    i === hi
                      ? 'bg-quasar-yellow/30 text-quasar-black'
                      : 'text-quasar-black hover:bg-quasar-gray-light/50',
                    o.value === value && 'font-medium',
                  )}
                >
                  <div>{o.label}</div>
                  {o.secondary && (
                    <div className="text-xs text-quasar-gray">
                      {o.secondary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
