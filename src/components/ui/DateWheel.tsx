import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

// Selector de dată pe role (stil „alarmă iPhone"): trei coloane cu scroll-snap —
// zi, lună, an. Pentru data nașterii bate calendarul: anul se alege dintr-o
// singură mișcare, fără să sari din lună în lună.

const ITEM_H = 34
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

type Parts = { y: number; m: number; d: number }

function parse(iso: string | null | undefined): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) }
}

type ColumnProps = {
  items: string[]
  index: number
  onIndex: (i: number) => void
  label: string
  className?: string
}

function Column({ items, index, onIndex, label, className }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  // Poziționează pe valoarea curentă când se schimbă din afară (inclusiv la
  // deschidere) — fără animație, ca deschiderea să nu „curgă".
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = index * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
  }, [index])

  const settle = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      if (i !== index) onIndex(i)
      else el.scrollTop = i * ITEM_H
    }, 120)
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={settle}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && index < items.length - 1) {
          e.preventDefault()
          onIndex(index + 1)
        } else if (e.key === 'ArrowUp' && index > 0) {
          e.preventDefault()
          onIndex(index - 1)
        }
      }}
      className={cn(
        'snap-y snap-mandatory overflow-y-auto overscroll-contain hide-scrollbar outline-none focus-visible:ring-2 focus-visible:ring-quasar-yellow/40',
        className,
      )}
      style={{ height: VISIBLE * ITEM_H, scrollPaddingBlock: PAD }}
    >
      <div style={{ paddingTop: PAD, paddingBottom: PAD }}>
        {items.map((it, i) => (
          <button
            key={it}
            type="button"
            role="option"
            aria-selected={i === index}
            onClick={() => onIndex(i)}
            className={cn(
              'flex w-full snap-center items-center justify-center px-1 text-sm transition-colors',
              i === index ? 'font-semibold text-ink' : 'text-muted',
            )}
            style={{ height: ITEM_H }}
          >
            {it}
          </button>
        ))}
      </div>
    </div>
  )
}

type Props = {
  /** ISO (YYYY-MM-DD) sau gol. */
  value?: string | null
  onChange: (iso: string) => void
  /** Anul din centru când câmpul e gol — implicit acum 10 ani (cursanții sunt copii). */
  defaultYearOffset?: number | undefined
  onDone?: () => void
}

export function DateWheel({ value, onChange, defaultYearOffset, onDone }: Props) {
  const anBaza = defaultYearOffset ?? 10
  const azi = new Date()
  const anMax = azi.getFullYear()
  const anMin = anMax - 100
  const ani: string[] = []
  for (let y = anMax; y >= anMin; y--) ani.push(String(y))

  // Starea internă ține rolele și când câmpul e gol (nu scriem o dată pe care
  // omul n-a ales-o — abia prima rotire/click comite valoarea).
  const [parts, setParts] = useState<Parts>(
    () => parse(value) ?? { y: anMax - anBaza, m: 0, d: 1 },
  )

  useEffect(() => {
    const p = parse(value)
    if (p) setParts(p)
  }, [value])

  const zile: string[] = []
  for (let d = 1; d <= daysInMonth(parts.y, parts.m); d++) zile.push(String(d))

  const commit = (next: Parts) => {
    // Ziua 31 într-o lună de 30 → se prinde de ultima zi, nu sare în luna următoare.
    const d = Math.min(next.d, daysInMonth(next.y, next.m))
    const fixed = { ...next, d }
    setParts(fixed)
    onChange(`${fixed.y}-${pad2(fixed.m + 1)}-${pad2(d)}`)
  }

  return (
    <div className="w-[260px] p-1">
      <div className="relative">
        {/* Banda de selecție din centru */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 rounded-lg bg-surface"
          style={{ top: PAD, height: ITEM_H }}
        />
        {/* Estompare sus/jos — sugerează că rolele continuă dincolo de fereastră. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-card to-transparent"
          style={{ height: PAD }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-card to-transparent"
          style={{ height: PAD }}
        />
        <div className="relative grid grid-cols-[64px_minmax(0,1fr)_72px] gap-1">
          <Column
            label="Ziua"
            items={zile}
            index={parts.d - 1}
            onIndex={(i) => commit({ ...parts, d: i + 1 })}
          />
          <Column
            label="Luna"
            items={LUNI}
            index={parts.m}
            onIndex={(i) => commit({ ...parts, m: i })}
          />
          <Column
            label="Anul"
            items={ani}
            index={anMax - parts.y}
            onIndex={(i) => commit({ ...parts, y: anMax - i })}
          />
        </div>
      </div>
      {onDone && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md px-2 py-1 text-sm font-medium text-quasar-black hover:bg-surface"
          >
            Gata
          </button>
        </div>
      )}
    </div>
  )
}
