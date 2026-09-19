import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { DateInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { canAccessRoute, roleLabel } from '@/lib/rolesMatrix'
import { isMobileRoute } from '@/lib/mobileMatrix'
import { initialsFromEmail } from '../accountInitials'
import { LocationPicker } from '../LocationPicker'
import { SectionIcon } from '../SectionIcon'
import { visibleSections } from '../navConfig'

const ROW =
  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-ink transition-colors active:bg-surface'

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { user, role, teacherId, signOut } = useAuth()
  const { date, setDate, isToday, resetToToday } = useWorkingDate()
  const { active: todayOnly } = useTodayOnly()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Secțiunile păstrează doar destinațiile adaptate; restul trăiesc pe desktop.
  const sections = visibleSections(role, teacherId, todayOnly)
    .map((s) => ({ ...s, items: s.items.filter((i) => isMobileRoute(i.path)) }))
    .filter((s) => s.items.length > 0)

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
      onPointerDown={onClose}
    >
      <div
        className="max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-card pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-card px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-quasar-yellow text-[13px] font-bold text-ink">
            {initialsFromEmail(user?.email)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-ink">
              {user?.email?.split('@')[0] ?? 'Cont'}
            </span>
            <span className="block text-xs text-muted">
              {roleLabel(role, teacherId)}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide meniul"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-2 active:bg-surface"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Locația de lucru
          </div>
          <LocationPicker />

          {!todayOnly && (
            <>
              <div className="mb-1.5 mt-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Ziua de lucru
                </span>
                {!isToday && (
                  <button
                    type="button"
                    onClick={resetToToday}
                    className="rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    Revino la azi
                  </button>
                )}
              </div>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </>
          )}
        </div>

        <div className="px-2 py-2">
          {sections.map((section) => (
            <div key={section.label} className="mb-1">
              <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span style={{ color: section.color }}>
                  <SectionIcon label={section.label} />
                </span>
                {section.label}
              </div>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [ROW, isActive ? 'bg-surface font-semibold' : ''].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          {!todayOnly && (
            <p className="px-3 pb-2 pt-1 text-xs text-muted">
              Restul modulelor se lucrează de pe desktop.
            </p>
          )}
        </div>

        <div className="border-t border-line px-2 py-2">
          <a
            href="/prezentari/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className={ROW}
            onClick={onClose}
          >
            <span aria-hidden>📚</span>
            <span>Ghiduri &amp; manual</span>
          </a>
          {canAccessRoute(role, '/anunturi') && isMobileRoute('/anunturi') && (
            <button type="button" className={ROW} onClick={() => go('/anunturi')}>
              <span aria-hidden>📢</span>
              <span>Anunțuri</span>
            </button>
          )}
          {canAccessRoute(role, '/feedback-app') && isMobileRoute('/feedback-app') && (
            <button type="button" className={ROW} onClick={() => go('/feedback-app')}>
              <span aria-hidden>💬</span>
              <span>Feedback aplicație</span>
            </button>
          )}
          <button
            type="button"
            className={ROW}
            onClick={() => {
              onClose()
              void signOut()
            }}
          >
            <span aria-hidden>↪</span>
            <span>Ieșire</span>
          </button>
        </div>
      </div>
    </div>
  )
}
