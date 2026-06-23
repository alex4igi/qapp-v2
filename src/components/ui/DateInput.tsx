import { useEffect, useId, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Selector de dată în format european (DD.MM.YYYY), independent de locale-ul browserului.
// Native <input type="date"> afișează formatul după locale (en-US => MM/DD/YYYY); aici ținem
// valoarea canonică în ISO (YYYY-MM-DD) și afișăm/parsăm european. Calendarul nativ rămâne
// disponibil printr-un input ascuns deschis cu showPicker().

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
> & {
  value?: string | null
  onChange?: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  wrapperClassName?: string
}

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
  ...rest
}: Props) {
  const [text, setText] = useState(() => isoToEu(value))
  const nativeRef = useRef<HTMLInputElement>(null)
  const fallbackId = useId()
  const inputId = id ?? fallbackId

  // Sincronizează afișarea când valoarea ISO se schimbă din exterior (reset form, prefill).
  useEffect(() => {
    setText((cur) => (euToIso(cur) === (value || '') ? cur : isoToEu(value)))
  }, [value])

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
    // La blur: dacă textul nu e o dată validă completă, golește (rămâne ISO gol).
    if (text !== '' && euToIso(text) === null) {
      setText('')
      onChange?.({ target: { value: '' } })
    }
  }

  function openPicker() {
    const el = nativeRef.current
    if (!el || disabled) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  return (
    <div className={cn('relative w-full', wrapperClassName, disabled && 'opacity-60')}>
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
          'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/40 disabled:bg-quasar-gray-light',
          className,
        )}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Deschide calendar"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-base leading-none hover:bg-quasar-gray-light disabled:cursor-not-allowed"
      >
        📅
      </button>
      {/* Input nativ ascuns: oferă calendarul popup; valoarea lui rămâne ISO. */}
      <input
        ref={nativeRef}
        type="date"
        lang="ro-RO"
        tabIndex={-1}
        aria-hidden
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => {
          setText(isoToEu(e.target.value))
          onChange?.({ target: { value: e.target.value } })
        }}
        className="pointer-events-none absolute right-2 bottom-0 h-0 w-0 opacity-0"
      />
    </div>
  )
}
