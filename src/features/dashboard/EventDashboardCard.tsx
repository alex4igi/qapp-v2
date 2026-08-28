import { Link } from 'react-router-dom'
import type { DashboardEvent } from './api'

const TIP_EMOJI: Record<string, string> = {
  Eveniment: '🎉',
  Workshop: '🎓',
  Auditie: '🎤',
  'DEMO Class': '🕺',
}

// Card de eveniment pe dashboard — intenționat mai mare și mai evident decât
// CircleCourseCard (card de grupă), cu accent galben Quasar.
export function EventDashboardCard({ event }: { event: DashboardEvent }) {
  const emoji = TIP_EMOJI[event.tip] ?? '🎉'
  const meta = [event.tip, event.locatia].filter(Boolean).join(' · ')
  return (
    <Link
      to={`/eveniment/${event.id}`}
      className="flex items-center gap-4 rounded-2xl border-2 border-quasar-yellow bg-quasar-yellow/10 p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-3xl">
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-xl font-bold text-quasar-black">
          {event.nume}
        </div>
        <div className="mt-0.5 truncate text-sm text-quasar-gray">
          {meta || '—'}
        </div>
      </div>
      <div className="shrink-0 text-center">
        <div className="font-display text-3xl font-bold text-quasar-black">
          {event.participantiCount}
        </div>
        <div className="text-xs text-quasar-gray">participanți</div>
      </div>
    </Link>
  )
}
