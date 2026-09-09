import { defaultRouteForRole } from '@/lib/rolesMatrix'
import { mobileDefaultRoute } from '@/lib/mobileMatrix'
import { useAuth } from './useAuth'
import { useIsMobile } from './useIsMobile'

/**
 * Unde aterizează contul curent: pe desktop matricea de roluri, pe telefon lista
 * albă de mobil. Fără el, owner/admin ar intra pe /analytics și ar vedea din
 * prima ecranul „doar desktop".
 */
export function useLandingRoute(): string {
  const { role } = useAuth()
  const isMobile = useIsMobile()
  return isMobile ? mobileDefaultRoute(role) : defaultRouteForRole(role)
}
