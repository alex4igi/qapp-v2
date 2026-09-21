import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Tooltip, type BadgeTone } from '@/components/ui'

export type RandDeUrmarit = {
  key: string
  /** Cifra din insignă; „—" când indicatorul încă nu are ce măsura. */
  valoare: ReactNode
  tone: BadgeTone
  text: string
  hint?: string
  to: string
  info?: ReactNode
}

// Maximum trei rânduri, fiecare ducând spre lista care se lucrează. Un rând fără
// cazuri dispare; fără niciun rând dispare toată secțiunea (o pagină de management
// n-are de ce să afișeze „totul e în regulă" pe un ecran întreg).
export function DeUrmarit({ rows }: { rows: RandDeUrmarit[] }) {
  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">De urmărit</h3>
      <ul className="divide-y divide-line-2">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              to={r.to}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-rowhover"
            >
              <Badge tone={r.tone} className="min-w-10 justify-center">
                {r.valoare}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{r.text}</span>
                {r.hint && (
                  <span className="block truncate text-xs text-muted-2">
                    {r.hint}
                  </span>
                )}
              </span>
              {r.info && (
                <Tooltip content={r.info} width={300}>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Ce numără"
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted"
                  >
                    i
                  </span>
                </Tooltip>
              )}
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
