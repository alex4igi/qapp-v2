import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute } from '@/lib/rolesMatrix'
import { getUnreadCount } from '@/features/notificari/api'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { Logo } from './Logo'
import { TopNav } from './TopNav'
import { AccountMenu } from './AccountMenu'

export function Header() {
  const { role } = useAuth()
  const { date, setDate } = useWorkingDate()
  const {
    locatieId,
    setLocatieId,
    options: locatiiOpts,
    locatieNume,
    locked: locatieLocked,
  } = useWorkingLocatie()

  const showNotificari = canAccessRoute(role, '/notificari')
  const notifQ = useQuery({
    queryKey: ['notificari-unread'],
    queryFn: getUnreadCount,
    enabled: showNotificari,
    refetchInterval: 60_000, // refresh la 1 min
  })
  const unreadCount = notifQ.data ?? 0

  return (
    <header className="flex items-center gap-6 border-b border-quasar-yellow-dark bg-quasar-yellow/30 px-6 py-3">
      <Link
        to="/"
        className="shrink-0 rounded-md bg-quasar-black px-3 py-1.5"
        title="Dashboard (click logo)"
      >
        <Logo />
      </Link>

      <div className="flex-1">
        <TopNav />
      </div>

      <div className="flex items-center gap-3 text-sm">
        {/* Context de lucru: locație + dată, grupate într-un singur pill compact */}
        <div className="flex items-center rounded-lg border border-gray-300 bg-white shadow-sm">
          {locatieLocked ? (
            <span
              className="flex items-center gap-1.5 px-2 py-1 text-quasar-black/70"
              title="Locația ta este setată de admin"
            >
              <span aria-hidden>📍</span>
              <span className="font-medium">{locatieNume ?? '—'}</span>
            </span>
          ) : (
            <label
              className="flex items-center gap-1.5 px-2 py-1"
              title="Locația de lucru — filtrează cursuri/prezențe/încasări"
            >
              <span aria-hidden>📍</span>
              <select
                value={locatieId ?? '__all__'}
                onChange={(e) =>
                  setLocatieId(e.target.value === '__all__' ? null : e.target.value)
                }
                className="bg-transparent text-sm text-quasar-black outline-none"
              >
                <option value="__all__">Toate locațiile</option>
                {locatiiOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <span className="h-5 w-px bg-gray-200" aria-hidden />

          <label className="flex items-center gap-1.5 px-2 py-1" title="Ziua de lucru">
            <span aria-hidden>📅</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm text-quasar-black outline-none"
            />
          </label>
        </div>

        <a
          href="/prezentari/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-base shadow-sm transition-colors hover:bg-gray-100"
          title="Ghiduri & manual de utilizare"
          aria-label="Ghiduri & manual"
        >
          📚
        </a>

        {showNotificari && (
          <Link
            to="/notificari"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-base shadow-sm transition-colors hover:bg-gray-100"
            title={
              unreadCount > 0 ? `${unreadCount} notificări ne-citite` : 'Notificări'
            }
            aria-label="Notificări"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        )}

        <AccountMenu />
      </div>
    </header>
  )
}
