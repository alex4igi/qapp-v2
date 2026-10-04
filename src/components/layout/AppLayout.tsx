import { WorkingDateProvider } from '@/hooks/useWorkingDate'
import { WorkingLocatieProvider } from '@/hooks/useWorkingLocatie'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useUtilizareTracking } from '@/lib/utilizare'
import { DesktopShell } from './DesktopShell'
import { MobileShell } from './mobile/MobileShell'
import { SugestieLocatieRetea } from './SugestieLocatieRetea'

export function AppLayout() {
  const isMobile = useIsMobile()
  // Delogarea pe inactivitate păzește un ecran lăsat deschis la recepție. Pe
  // telefon paza o face ecranul de blocare, iar instructorul ține telefonul în
  // buzunar între grupe — 30 de minute l-ar da afară în mijlocul turei.
  useIdleLogout(!isMobile)
  useUtilizareTracking(isMobile)

  return (
    <WorkingDateProvider>
      <WorkingLocatieProvider>
        {isMobile ? <MobileShell /> : <DesktopShell />}
        <SugestieLocatieRetea />
      </WorkingLocatieProvider>
    </WorkingDateProvider>
  )
}
