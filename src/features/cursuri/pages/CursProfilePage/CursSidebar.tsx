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
      ? 'text-quasar-gray'
      : ratio >= 1
        ? 'text-red-600'
        : ratio >= 0.8
          ? 'text-amber-600'
          : 'text-emerald-600'

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-quasar-yellow font-display text-3xl font-bold text-quasar-black">
          {initials}
        </div>
      </div>
      <h2 className="text-center font-display text-lg font-bold text-quasar-black">
        {numele}
      </h2>
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center shadow-sm">
        <p className="text-xs font-medium text-quasar-gray">Ocupare</p>
        <p className={`mt-1 font-display text-2xl font-bold ${color}`}>
          {activi} / {cap ?? '—'}
        </p>
        {libere != null && (
          <p className="mt-0.5 text-[11px] font-medium text-quasar-gray">
            {libere === 0
              ? facultativ
                ? 'sesiune plină'
                : 'fără locuri libere'
              : `${libere} ${libere === 1 ? 'loc liber' : 'locuri libere'}`}
          </p>
        )}
        {facultativ && (
          <p className="mt-0.5 text-[11px] text-quasar-gray">
            vârf ședință
            {media != null && ` · media ${media}/${cap ?? '—'}`}
          </p>
        )}
      </div>
    </aside>
  )
}
