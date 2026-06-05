type Props = {
  initials: string
  numele: string
  ocupare: { activi: number; capacitate: number | null } | undefined
}

export function CursSidebar({ initials, numele, ocupare }: Props) {
  const cap = ocupare?.capacitate ?? null
  const activi = ocupare?.activi ?? 0
  const ratio = cap && cap > 0 ? activi / cap : 0
  const color =
    cap == null
      ? 'text-quasar-gray'
      : ratio >= 1
        ? 'text-red-600'
        : ratio >= 0.8
          ? 'text-amber-600'
          : 'text-emerald-600'

  return (
    <aside className="rounded-lg border border-quasar-gray-light bg-white p-4">
      <div className="mb-3 flex justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-quasar-yellow text-3xl font-bold text-quasar-black">
          {initials}
        </div>
      </div>
      <h2 className="text-center text-lg font-bold text-quasar-black">{numele}</h2>
      <div className="mt-4 text-center">
        <p className="text-xs font-medium text-quasar-gray">Ocupare</p>
        <p className={`mt-1 text-xl font-bold ${color}`}>
          {activi} / {cap ?? '—'}
        </p>
      </div>
    </aside>
  )
}
