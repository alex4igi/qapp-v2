import { Outlet, useLocation } from 'react-router-dom'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { isTodayOnlyRoute } from '@/lib/todayOnlyMatrix'
import { Rail } from './Rail'
import { TodayOnlyBlockedPage } from './TodayOnlyBlockedPage'
import { TopBar } from './TopBar'
import { WorkingDayBanner } from './WorkingDayBanner'

/** Shell-ul clasic: rail lateral permanent + bară de utilitare + conținut. */
export function DesktopShell() {
  const { pathname } = useLocation()
  const { active: todayOnly } = useTodayOnly()
  const blocked = todayOnly && !isTodayOnlyRoute(pathname)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <WorkingDayBanner />
        <main className="qcontent flex-1 overflow-y-auto p-6">
          {blocked ? <TodayOnlyBlockedPage /> : <Outlet />}
        </main>
      </div>
    </div>
  )
}
