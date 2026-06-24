import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

// Selector de lună calendaristică (valoare canonică "YYYY-MM"). Înlocuiește <input type="month">,
// care în Firefox nu afișează niciun calendar și are UX inconsistent între browsere. Aici afișăm
// un popover cu navigare pe ani și o grilă de 12 luni; ziua nu contează.

type Props = {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  className?: string
}

const LUNI = [
  'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun',
  'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec',
]
const LUNI_LUNG = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function parse(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) }
}

function format(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function MonthPicker({ value, onChange, id, disabled, className }: Props) {
  const parsed = parse(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => parsed?.year ?? new Date().getFullYear())
  const rootRef = useRef<HTMLDivElement>(null)
  const fallbackId = useId()
  const inputId = id ?? fallbackId

  // La fiecare deschidere, centrează vizualizarea pe anul valorii curente.
  useEffect(() => {
    if (open) setViewYear(parse(value)?.year ?? new Date().getFullYear())
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = parsed ? `${LUNI_LUNG[parsed.month - 1]} ${parsed.year}` : 'Alege luna'

  return (
    <div ref={rootRef} className={cn('relative w-full', disabled && 'opacity-60')}>
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/40 disabled:bg-quasar-gray-light',
          className,
        )}
      >
        <span className={cn(!parsed && 'text-gray-400')}>{label}</span>
        <span className="text-base leading-none">📅</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Anul precedent"
              className="rounded p-1 text-sm hover:bg-quasar-gray-light"
            >
              ◀
            </button>
            <span className="text-sm font-bold text-quasar-black">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Anul următor"
              className="rounded p-1 text-sm hover:bg-quasar-gray-light"
            >
              ▶
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {LUNI.map((nume, i) => {
              const selected = parsed?.year === viewYear && parsed?.month === i + 1
              return (
                <button
                  key={nume}
                  type="button"
                  onClick={() => {
                    onChange(format(viewYear, i + 1))
                    setOpen(false)
                  }}
                  className={cn(
                    'rounded-md px-2 py-2 text-sm transition-colors',
                    selected
                      ? 'bg-quasar-yellow font-bold text-quasar-black'
                      : 'hover:bg-quasar-gray-light',
                  )}
                >
                  {nume}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
