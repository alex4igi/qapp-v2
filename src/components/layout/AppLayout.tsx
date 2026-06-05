import { Outlet } from 'react-router-dom'
import { WorkingDateProvider } from '@/hooks/useWorkingDate'
import { WorkingLocatieProvider } from '@/hooks/useWorkingLocatie'
import { Header } from './Header'
import { QuickActions } from './QuickActions'
import { WorkingDayBanner } from './WorkingDayBanner'

export function AppLayout() {
  return (
    <WorkingDateProvider>
      <WorkingLocatieProvider>
        <div className="flex h-screen w-screen flex-col">
          <Header />
          <WorkingDayBanner />
          <div className="flex flex-1 overflow-hidden">
            <aside className="w-40 shrink-0 overflow-y-auto border-r border-quasar-gray-light bg-white">
              <QuickActions />
            </aside>
            <main className="flex-1 overflow-y-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </WorkingLocatieProvider>
    </WorkingDateProvider>
  )
}
