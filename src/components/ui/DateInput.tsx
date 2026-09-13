import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { DateWheel } from './DateWheel'

// Selector de dată în format european (DD.MM.YYYY), independent de locale-ul browserului.
// Valoarea canonică e ISO (YYYY-MM-DD). Calendarul e custom (popover cu selectoare
// lună + an), ca să poți sări rapid peste ani (ex: data nașterii) — nu doar săgeți.

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
> & {
  value?: string | null
  onChange?: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  wrapperClassName?: string
  /** 'wheel' = role zi/lună/an (data nașterii); implicit calendarul pe luni. */
  picker?: 'calendar' | 'wheel'
}

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]
const ZILE_SCURT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// ISO (YYYY-MM-DD) -> european (DD.MM.YYYY)
function isoToEu(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  return `${m[3]}.${m[2]}.${m[1]}`
}

// Formatează cifrele tastate ca DD.MM.YYYY pe măsură ce userul scrie.
function maskEu(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean)
  return parts.join('.')
}

// european (DD.MM.YYYY) complet și valid -> ISO; altfel null
function euToIso(eu: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(eu)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const dt = new Date(yyyy, mm - 1, dd)
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  min,
  max,
  placeholder,
  id,
  wrapperClassName,
  picker = 'calendar',
  ...rest
}: Props) {
  const [text, setText] = useState(() => isoToEu(value))
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fallbackId = useId()
  const inputId = id ?? fallbackId

  // Luna/anul vizibile în calendar.
  const today = new Date()
  const valIso = euToIso(text) ?? (value || '')
  const [view, setView] = useState(() => {
    const base = valIso ? new Date(valIso) : today
    return { y: base.getFullYear(), m: base.getMonth() }
  })

  // Sincronizează afișarea când valoarea ISO se schimbă din exterior (reset form, prefill).
  useEffect(() => {
    setText((cur) => (euToIso(cur) === (value || '') ? cur : isoToEu(value)))
  }, [value])

  // La deschidere, poziționează calendarul pe luna valorii curente (sau azi).
  useEffect(() => {
    if (!open) return
    const base = valIso ? new Date(valIso) : today
    setView({ y: base.getFullYear(), m: base.getMonth() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Închide la click în afară / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function commit(eu: string) {
    const iso = euToIso(eu)
    if (iso !== null) onChange?.({ target: { value: iso } })
    else if (eu === '') onChange?.({ target: { value: '' } })
  }

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskEu(e.target.value)
    setText(masked)
    commit(masked)
  }

  function handleBlur() {
    if (text !== '' && euToIso(text) === null) {
      setText('')
      onChange?.({ target: { value: '' } })
    }
  }

  function pick(day: number) {
    const iso = `${view.y}-${pad(view.m + 1)}-${pad(day)}`
    setText(isoToEu(iso))
    onChange?.({ target: { value: iso } })
    setOpen(false)
  }

  // Anii din dropdown: de la azi+5 până la azi-100 (acoperă date de naștere).
  const years = useMemo(() => {
    const hi = today.getFullYear() + 5
    const out: number[] = []
    for (let y = hi; y >= hi - 105; y--) out.push(y)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Grila lunii: offset luni-întâi + zilele.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const offset = (first.getDay() + 6) % 7 // Luni = 0
    const dim = new Date(view.y, view.m + 1, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < offset; i++) arr.push(null)
    for (let d = 1; d <= dim; d++) arr.push(d)
    return arr
  }, [view])

  const isDisabledDay = (day: number) => {
    const iso = `${view.y}-${pad(view.m + 1)}-${pad(day)}`
    if (min && iso < min) return true
    if (max && iso > max) return true
    return false
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta
      const y = v.y + Math.floor(m / 12)
      return { y, m: ((m % 12) + 12) % 12 }
    })
  }

  return (
    <div
      ref={wrapRef}
      className={cn('relative w-full', wrapperClassName, disabled && 'opacity-60')}
    >
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? 'ZZ.LL.AAAA'}
        value={text}
        onChange={handleText}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn(
          'w-full rounded-[10px] border border-line bg-card px-3 py-2 pr-9 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
          className,
        )}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={picker === 'wheel' ? 'Deschide selectorul de dată' : 'Deschide calendar'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-base leading-none hover:bg-surface disabled:cursor-not-allowed"
      >
        📅
      </button>

      {open && !disabled && picker === 'wheel' && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-line bg-card p-2 shadow-lg">
          <DateWheel
            value={valIso || null}
            onChange={(iso) => {
              setText(isoToEu(iso))
              onChange?.({ target: { value: iso } })
            }}
            onDone={() => setOpen(false)}
          />
        </div>
      )}

      {open && !disabled && picker === 'calendar' && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-line bg-card p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Luna anterioară"
              className="rounded px-2 py-1 text-sm hover:bg-surface"
            >
              ‹
            </button>
            <select
              value={view.m}
              onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
              className="flex-1 rounded border border-line px-1 py-1 text-sm outline-none focus:border-quasar-yellow"
            >
              {LUNI.map((l, i) => (
                <option key={l} value={i}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={view.y}
              onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
              className="rounded border border-line px-1 py-1 text-sm outline-none focus:border-quasar-yellow"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Luna următoare"
              className="rounded px-2 py-1 text-sm hover:bg-surface"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted">
            {ZILE_SCURT.map((z, i) => (
              <span key={i}>{z}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) =>
              day === null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabledDay(day)}
                  onClick={() => pick(day)}
                  className={cn(
                    'rounded py-1 text-center text-sm hover:bg-quasar-yellow/40 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
                    valIso === `${view.y}-${pad(view.m + 1)}-${pad(day)}` &&
                      'bg-quasar-yellow font-semibold',
                  )}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
