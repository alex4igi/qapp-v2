import { useWorkingDate } from '@/hooks/useWorkingDate'

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = [
    'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
    'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
  ]
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}

export function WorkingDayBanner() {
  const { date, isToday, resetToToday } = useWorkingDate()
  if (isToday) return null
  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span aria-hidden>⚠️</span>
      <span>
        Atenție: <strong>lucrezi pe ziua {fmt(date)}</strong>, nu pe ziua de
        azi.
      </span>
      <button
        type="button"
        onClick={resetToToday}
        className="ml-2 rounded border border-amber-400 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
      >
        Revino la azi ✕
      </button>
    </div>
  )
}
