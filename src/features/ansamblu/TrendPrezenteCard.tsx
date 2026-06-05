import { useState } from 'react'
import type { TrendPrezenteRow } from './api'

const CHART_H = 44

function formatSapt(iso: string): string {
  // "2026-05-18" → "18.05"
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

export function TrendPrezenteCard({ row }: { row: TrendPrezenteRow }) {
  const weeks = row.saptamani ?? []
  const n = weeks.length
  const [hover, setHover] = useState<number | null>(null)
  const delta =
    row.rata_recenta != null && row.rata_precedenta != null
      ? row.rata_recenta - row.rata_precedenta
      : null

  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        row.in_scadere ? 'border-red-300' : 'border-quasar-gray-light'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-quasar-black">
            {row.curs_nume}
          </div>
          <div className="truncate text-xs text-quasar-gray">
            {[row.teacher_nume, row.locatie_nume].filter(Boolean).join(' · ') ||
              '—'}
          </div>
        </div>
        {row.in_scadere && (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            necesită atenție
          </span>
        )}
      </div>

      {/* Sparkline: o bară per săptămână, înălțime ∝ rata. Ultimele 3 evidențiate.
          Hover pe o bară → tooltip cu prezenți/roster + săptămâna + rata. */}
      <div className="relative mt-3">
        {hover != null && weeks[hover] && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-quasar-black px-2 py-1 text-[10px] leading-tight text-white shadow-lg"
            style={{ left: `${((hover + 0.5) / n) * 100}%`, bottom: CHART_H + 6 }}
          >
            <div className="font-semibold">
              {weeks[hover].prezenti}/{weeks[hover].roster} prezenți
            </div>
            <div className="text-quasar-gray-light">
              {formatSapt(weeks[hover].saptamana)} · {weeks[hover].rata}%
            </div>
          </div>
        )}
        <div className="flex items-end gap-1" style={{ height: CHART_H }}>
          {weeks.map((w, i) => {
            const recent = i >= n - 3
            const h = Math.max(2, Math.round((w.rata / 100) * CHART_H))
            const color = recent
              ? row.in_scadere
                ? '#ef4444'
                : '#10b981'
              : '#d1d5db'
            return (
              <div
                key={w.saptamana}
                className="flex-1 cursor-default rounded-t transition-opacity hover:opacity-70"
                style={{ height: h, backgroundColor: color }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                title={`${formatSapt(w.saptamana)} — ${w.rata}% (${w.prezenti}/${w.roster})`}
              />
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-quasar-gray">
        <span>{n > 0 ? formatSapt(weeks[0].saptamana) : ''}</span>
        <span>{n > 0 ? formatSapt(weeks[n - 1].saptamana) : ''}</span>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-quasar-gray-light pt-2 text-xs">
        <span className="text-quasar-gray">
          Ultimele 3 săpt:{' '}
          <span className="font-semibold text-quasar-black">
            {row.rata_recenta != null ? `${row.rata_recenta}%` : '—'}
          </span>
        </span>
        {delta != null && (
          <span
            className={`font-semibold ${
              delta < 0 ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}pp
          </span>
        )}
      </div>
    </div>
  )
}
