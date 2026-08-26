import { useState } from 'react'
import type { Rezultat, StareItem } from '@/lib/checklist'
import { ChecklistBadge } from './ChecklistBadge'

type Props = {
  rezultat: Rezultat
  titlu?: string
  /** Absent ⇒ card read-only (utilizatorul nu are drept de editare). */
  onFix?: (item: StareItem) => void
}

const BARA: Record<string, string> = {
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  brand: 'bg-quasar-yellow',
}

function Grup({
  titlu,
  items,
  onFix,
}: {
  titlu: string
  items: StareItem[]
  onFix?: (item: StareItem) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {titlu}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => {
          const continut = (
            <>
              <span className="mt-[3px] shrink-0 text-xs leading-none">
                {item.severitate === 'esential' ? '🔴' : '🟡'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {item.eticheta}
                </span>
                {item.motiv && (
                  <span className="block text-[11px] leading-snug text-muted-2">
                    {item.motiv}
                  </span>
                )}
              </span>
            </>
          )
          return (
            <li key={item.id}>
              {onFix ? (
                <button
                  type="button"
                  onClick={() => onFix(item)}
                  title={`Completează „${item.eticheta}"`}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
                >
                  {continut}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-2 py-1.5">{continut}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Cardul de completare a fișei. Itemii lipsă sunt afișați integral (sunt puțini
// și sunt motivul cardului); cei bifați stau colapsați ca să nu umple bara laterală.
export function ChecklistCard({ rezultat, titlu = 'Completare fișă', onFix }: Props) {
  const [bifateOpen, setBifateOpen] = useState(false)
  const bifate = rezultat.aplicabile.filter((s) => s.completat)

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold text-ink">{titlu}</h2>
        <span className="text-xs font-semibold text-muted-2">
          {rezultat.completate}/{rezultat.total}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-quasar-gray-light">
        <div
          className={`h-full rounded-full transition-all ${BARA[rezultat.tone] ?? 'bg-neutral'}`}
          style={{ width: `${rezultat.procent}%` }}
        />
      </div>

      {rezultat.completa ? (
        <p className="mt-3 text-sm font-medium text-success">
          ✓ Fișa este completă.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <ChecklistBadge rezultat={rezultat} />
          </div>
          <Grup
            titlu="Esențiale"
            items={rezultat.lipsaEsentiale}
            onFix={onFix}
          />
          <Grup
            titlu="Recomandate"
            items={rezultat.lipsaRecomandate}
            onFix={onFix}
          />
        </>
      )}

      {bifate.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <button
            type="button"
            aria-expanded={bifateOpen}
            onClick={() => setBifateOpen((o) => !o)}
            className="text-xs font-medium text-muted-2 transition-colors hover:text-ink"
          >
            {bifateOpen ? '▾' : '▸'} {bifate.length} completate
          </button>
          {bifateOpen && (
            <ul className="mt-1.5 space-y-1">
              {bifate.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 px-2 text-xs text-muted-2"
                >
                  <span className="text-success">✓</span>
                  <span>{item.eticheta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
