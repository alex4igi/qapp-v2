type Props = {
  initials: string
  numele: string
  ocupare:
    | {
        activi: number
        capacitate: number | null
        facultativ?: boolean
        media?: number | null
      }
    | undefined
}

export function CursSidebar({ initials, numele, ocupare }: Props) {
  const cap = ocupare?.capacitate ?? null
  const activi = ocupare?.activi ?? 0
  const facultativ = ocupare?.facultativ ?? false
  const media = ocupare?.media ?? null
  const ratio = cap && cap > 0 ? activi / cap : 0
  const libere = cap != null ? Math.max(0, cap - activi) : null
  const color =
    cap == null
      ? 'text-muted'
      : ratio >= 1
        ? 'text-danger'
        : ratio >= 0.8
          ? 'text-warn'
          : 'text-success'

  return (
    <aside className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="mb-3 flex justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-quasar-yellow font-display text-3xl font-bold text-ink">
          {initials}
        </div>
      </div>
      <h2 className="text-center font-display text-lg font-bold tracking-tight text-ink">
        {numele}
      </h2>
      <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-center">
        <p className="text-xs font-medium text-muted">Ocupare</p>
        <p className={`mt-1 font-display text-2xl font-bold ${color}`}>
          {activi} / {cap ?? '—'}
        </p>
        {libere != null && (
          <p className="mt-0.5 text-[11px] font-medium text-muted">
            {libere === 0
              ? facultativ
                ? 'sesiune plină'
                : 'fără locuri libere'
              : `${libere} ${libere === 1 ? 'loc liber' : 'locuri libere'}`}
          </p>
        )}
        {facultativ && (
          <p className="mt-0.5 text-[11px] text-muted">
            vârf ședință
            {media != null && ` · media ${media}/${cap ?? '—'}`}
          </p>
        )}
      </div>
    </aside>
  )
}
