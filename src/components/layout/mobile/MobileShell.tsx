import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { isMobileRoute } from '@/lib/mobileMatrix'
import { isTodayOnlyRoute } from '@/lib/todayOnlyMatrix'
import { TodayOnlyBlockedPage } from '../TodayOnlyBlockedPage'
import { WorkingDayBanner } from '../WorkingDayBanner'
import { BottomNav } from './BottomNav'
import { DesktopOnlyPage } from './DesktopOnlyPage'
import { MenuSheet } from './MenuSheet'
import { MobileSearchScreen } from './MobileSearchScreen'
import { MobileTopBar } from './MobileTopBar'

/**
 * Shell-ul de telefon: bară de sus + conținut + bară de tab-uri. Decizia „ruta
 * asta merge pe mobil?" se ia ÎNAINTE de `<Outlet/>`, ca paginile de desktop să
 * nu se monteze deloc — altfel și-ar porni query-urile degeaba.
 */
export function MobileShell() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { active: todayOnly } = useTodayOnly()
  const blocked = todayOnly && !isTodayOnlyRoute(pathname)

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface">
      <MobileTopBar
        onSearch={() => setSearchOpen(true)}
        onLocatie={() => setMenuOpen(true)}
      />
      <WorkingDayBanner />
      <main className="qcontent flex-1 overflow-y-auto p-4">
        {blocked ? (
          <TodayOnlyBlockedPage />
        ) : isMobileRoute(pathname) ? (
          <Outlet />
        ) : (
          <DesktopOnlyPage />
        )}
      </main>
      <BottomNav onMenu={() => setMenuOpen(true)} />
      {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)} />}
      {searchOpen && !todayOnly && <MobileSearchScreen onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
