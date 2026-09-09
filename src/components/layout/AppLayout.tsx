import { WorkingDateProvider } from '@/hooks/useWorkingDate'
import { WorkingLocatieProvider } from '@/hooks/useWorkingLocatie'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DesktopShell } from './DesktopShell'
import { MobileShell } from './mobile/MobileShell'

export function AppLayout() {
  const isMobile = useIsMobile()
  // Delogarea pe inactivitate păzește un ecran lăsat deschis la recepție. Pe
  // telefon paza o face ecranul de blocare, iar instructorul ține telefonul în
  // buzunar între grupe — 30 de minute l-ar da afară în mijlocul turei.
  useIdleLogout(!isMobile)

  return (
    <WorkingDateProvider>
      <WorkingLocatieProvider>
        {isMobile ? <MobileShell /> : <DesktopShell />}
      </WorkingLocatieProvider>
    </WorkingDateProvider>
  )
}
