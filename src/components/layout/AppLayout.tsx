import { Outlet } from 'react-router-dom'
import { WorkingDateProvider } from '@/hooks/useWorkingDate'
import { WorkingLocatieProvider } from '@/hooks/useWorkingLocatie'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { Rail } from './Rail'
import { TopBar } from './TopBar'
import { WorkingDayBanner } from './WorkingDayBanner'

export function AppLayout() {
  useIdleLogout()
  return (
    <WorkingDateProvider>
      <WorkingLocatieProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-surface">
          <Rail />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <WorkingDayBanner />
            <main className="qcontent flex-1 overflow-y-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </WorkingLocatieProvider>
    </WorkingDateProvider>
  )
}
