import { NavLink } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { activeTabPath, mobileTabsFor } from '@/lib/mobileMatrix'
import { isTodayOnlyRoute } from '@/lib/todayOnlyMatrix'
import { useUnreadCount } from '../useUnreadCount'
import { TabIcon } from './TabIcon'

const ITEM =
  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-medium transition-colors'

export function BottomNav({ onMenu }: { onMenu: () => void }) {
  const { role, teacherId } = useAuth()
  const { pathname } = useLocation()
  const { count: unreadCount } = useUnreadCount()

  const { active: todayOnly } = useTodayOnly()
  const tabs = mobileTabsFor(role, teacherId).filter(
    (t) => !todayOnly || isTodayOnlyRoute(t.path),
  )
  const active = activeTabPath(pathname, tabs)

  return (
    // `qapp-bottomnav`: singurul cârlig CSS — bara se ascunde când tastatura
    // taie înălțimea ecranului (regula din index.css).
    <nav
      className="qapp-bottomnav flex shrink-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigare principală"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.path
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={[
              ITEM,
              isActive ? 'text-ink' : 'text-muted-2',
            ].join(' ')}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-quasar-yellow"
              />
            )}
            <span className="relative">
              <TabIcon name={tab.icon} />
              {tab.icon === 'notif' && unreadCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="truncate">{tab.label}</span>
          </NavLink>
        )
      })}

      <button type="button" onClick={onMenu} className={`${ITEM} text-muted-2`}>
        <TabIcon name="meniu" />
        <span>Meniu</span>
      </button>
    </nav>
  )
}
