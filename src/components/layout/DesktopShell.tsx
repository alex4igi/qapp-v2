import { Outlet } from 'react-router-dom'
import { Rail } from './Rail'
import { TopBar } from './TopBar'
import { WorkingDayBanner } from './WorkingDayBanner'

/** Shell-ul clasic: rail lateral permanent + bară de utilitare + conținut. */
export function DesktopShell() {
  return (
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
  )
}
