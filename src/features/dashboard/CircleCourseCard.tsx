import { Link } from 'react-router-dom'

type Props = {
  cursId: string
  numele: string
  ora: string | null
  sala: string | null
  teacher: string | null
  prezenti: number
  enrolled: number
  to: string
}

function ringColor(prezenti: number, enrolled: number): string {
  if (enrolled === 0 || prezenti === 0) return '#dc2626' // red-600
  const pct = prezenti / enrolled
  if (pct < 0.5) return '#f97316' // orange-500
  return '#16a34a' // green-600
}

export function CircleCourseCard({
  cursId: _cursId,
  numele,
  ora,
  sala,
  teacher,
  prezenti,
  enrolled,
  to,
}: Props) {
  const color = ringColor(prezenti, enrolled)
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-quasar-gray-light/40"
    >
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full text-3xl font-bold text-quasar-black"
        style={{ border: `8px solid ${color}` }}
      >
        {prezenti}
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-quasar-black">
          {numele}
        </div>
        <div className="text-xs text-quasar-gray">
          {[ora, sala, teacher].filter(Boolean).join(' · ') || '—'}
        </div>
        <div className="text-xs text-quasar-gray">
          {prezenti} / {enrolled} înscriși
        </div>
      </div>
    </Link>
  )
}
