import type { StartSezonRosterRow } from '../api'

// Cele patru proveniențe ale unui cursant din sezonul nou. Ordinea e cea din
// clasificarea din DB: un om cade într-o singură categorie, prima care se potrivește.
export const CATEGORII = [
  { key: 'cat_r', label: 'reînscriere', color: 'var(--color-quasar-yellow)' },
  { key: 'cat_s', label: 'din sezonul trecut', color: 'var(--color-neutral)' },
  { key: 'cat_v', label: 'revenit din sezoane vechi', color: 'var(--color-muted)' },
  { key: 'cat_n', label: 'complet nou', color: 'var(--color-success)' },
] as const satisfies readonly {
  key: keyof Pick<StartSezonRosterRow, 'cat_r' | 'cat_s' | 'cat_v' | 'cat_n'>
  label: string
  color: string
}[]

export function CompozitieLegenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-2">
      {CATEGORII.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <i
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: c.color }}
          />
          {c.label}
        </span>
      ))}
    </div>
  )
}

export function CompozitieBar({ row }: { row: StartSezonRosterRow }) {
  if (row.inscrisi === 0) {
    return <span className="text-xs text-muted">—</span>
  }
  return (
    <div
      className="flex h-2 w-full min-w-[90px] overflow-hidden rounded-sm bg-line"
      title={CATEGORII.filter((c) => row[c.key] > 0)
        .map((c) => `${row[c.key]} ${c.label}`)
        .join(' · ')}
    >
      {CATEGORII.map((c) =>
        row[c.key] > 0 ? (
          <i
            key={c.key}
            className="block h-full"
            style={{
              background: c.color,
              width: `${(row[c.key] / row.inscrisi) * 100}%`,
            }}
          />
        ) : null,
      )}
    </div>
  )
}
