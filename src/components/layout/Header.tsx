import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { canAccessRoute, isFrontDesk, ROLE_LABEL } from '@/lib/rolesMatrix'
import { getUnreadCount } from '@/features/notificari/api'
import { AppFeedbackModal } from '@/features/feedback-app/AppFeedbackModal'
import { ComposeAnuntModal } from '@/features/announcements/ComposeAnuntModal'
import { Logo } from './Logo'
import { TopNav } from './TopNav'

export function Header() {
  const { user, role, signOut, endShift } = useAuth()
  const { date, setDate } = useWorkingDate()
  const {
    locatieId,
    setLocatieId,
    options: locatiiOpts,
    locatieNume,
    locked: locatieLocked,
  } = useWorkingLocatie()
  const showSetariIcon = canAccessRoute(role, '/setari')
  const showEndShift = isFrontDesk(role)
  const showNotificari = canAccessRoute(role, '/notificari')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [anuntOpen, setAnuntOpen] = useState(false)
  const showAnunturi = canAccessRoute(role, '/anunturi')

  const notifQ = useQuery({
    queryKey: ['notificari-unread'],
    queryFn: getUnreadCount,
    enabled: showNotificari,
    refetchInterval: 60_000, // refresh la 1 min
  })
  const unreadCount = notifQ.data ?? 0

  return (
    <>
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
        {locatieLocked ? (
          <div
            className="flex items-center gap-2 rounded-md border border-quasar-gray-light bg-quasar-gray-light/40 px-2 py-1 text-sm text-quasar-black"
            title="Locația ta este setată de admin"
          >
            <span aria-hidden>📍</span>
            <span className="font-medium">{locatieNume ?? '—'}</span>
          </div>
        ) : (
          <label
            className="flex items-center gap-2 rounded-md border border-quasar-gray-light bg-white px-2 py-1"
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
              <option value="__all__">— Toate locațiile —</option>
              {locatiiOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label
          className="flex items-center gap-2 rounded-md border border-quasar-gray-light bg-white px-2 py-1"
          title="Ziua de lucru"
        >
          <span aria-hidden>📅</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm text-quasar-black outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-quasar-gray-light bg-white text-base hover:bg-quasar-gray-light"
          title="Trimite feedback (bug / idee)"
          aria-label="Trimite feedback"
        >
          💬
        </button>

        {showAnunturi && (
          <button
            type="button"
            onClick={() => setAnuntOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-quasar-gray-light bg-white text-base hover:bg-quasar-gray-light"
            title="Anunț nou către staff"
            aria-label="Anunț nou"
          >
            📢
          </button>
        )}

        {showNotificari && (
          <Link
            to="/notificari"
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-quasar-gray-light bg-white text-base hover:bg-quasar-gray-light"
            title={
              unreadCount > 0
                ? `${unreadCount} notificări ne-citite`
                : 'Notificări'
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

        {showSetariIcon && (
          <Link
            to="/setari"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-quasar-gray-light bg-white text-base hover:bg-quasar-gray-light"
            title="Setări"
            aria-label="Setări"
          >
            ⚙
          </Link>
        )}

        <span className="text-quasar-black">
          {user?.email}
          <span className="ml-2 rounded bg-quasar-black px-1.5 py-0.5 text-xs font-medium text-quasar-yellow">
            {ROLE_LABEL[role]}
          </span>
        </span>
        {showEndShift && (
          <button
            type="button"
            onClick={() => void endShift()}
            className="rounded-md border border-quasar-yellow-dark bg-quasar-yellow px-3 py-1.5 font-bold text-quasar-black hover:bg-quasar-yellow-dark"
            title="Înregistrează plecarea + sign-out"
          >
            🏁 Încheie tura
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border border-quasar-gray-light bg-white px-3 py-1.5 font-medium text-quasar-black hover:bg-quasar-gray-light"
        >
          Ieșire
        </button>
      </div>
    </header>
    {feedbackOpen && (
      <AppFeedbackModal open onClose={() => setFeedbackOpen(false)} />
    )}
    {anuntOpen && (
      <ComposeAnuntModal open onClose={() => setAnuntOpen(false)} />
    )}
    </>
  )
}
