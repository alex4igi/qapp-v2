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
  /** Permite o valoare care nu e în listă („Adaugă «…»") — pentru cataloage
   *  deschise, unde valoarea E textul (nu un id). */
  allowCustom?: boolean
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
  allowCustom = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Valoarea liberă se afișează ca atare — altfel câmpul ar părea gol după ce
  // adaugi ceva ce încă nu e în listă.
  const selected =
    options.find((o) => o.value === value) ??
    (allowCustom && value ? { label: value, value } : null)

  // Căutarea e fără diacritice: „scoala gimnaziala" găsește „Școala Gimnazială".
  const filtered = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return options
    return options.filter((o) => {
      const haystack = fold(`${o.label} ${o.secondary ?? ''}`)
      return tokens.every((t) => haystack.includes(t))
    })
  }, [options, query])

  const customValue = query.trim()
  const showCustom =
    allowCustom &&
    customValue.length > 1 &&
    !options.some((o) => fold(o.label) === fold(customValue))

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
            } else if (open && showCustom) {
              e.preventDefault()
              pick(customValue)
            }
          } else if (e.key === 'Backspace' && !query && selected) {
            clear()
          }
        }}
        className={cn(
          'w-full rounded-lg border border-line bg-card px-3 py-2 pr-9 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
        )}
      />

      {allowClear && selected && !open && !disabled && (
        <button
          type="button"
          onClick={clear}
          aria-label="Șterge selecția"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:bg-surface hover:text-ink"
        >
          ✕
        </button>
      )}
      {(!selected || open) && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
          ▾
        </span>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-card shadow-lg">
          {filtered.length === 0 && !showCustom ? (
            <div className="px-3 py-2 text-sm text-muted">
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
                      ? 'bg-quasar-yellow/30 text-ink'
                      : 'text-ink hover:bg-surface',
                    o.value === value && 'font-medium',
                  )}
                >
                  <div>{o.label}</div>
                  {o.secondary && (
                    <div className="text-xs text-muted">
                      {o.secondary}
                    </div>
                  )}
                </li>
              ))}
              {showCustom && (
                <li
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(customValue)
                  }}
                  className="cursor-pointer border-t border-line px-3 py-2 text-sm text-ink hover:bg-surface"
                >
                  ➕ Adaugă „{customValue}"
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// Comparație fără diacritice și fără majuscule (căutare, nu identitate).
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
