import { defaultRouteForRole } from '@/lib/rolesMatrix'
import { mobileDefaultRoute } from '@/lib/mobileMatrix'
import { useAuth } from './useAuth'
import { useIsMobile } from './useIsMobile'

/**
 * Unde aterizează contul curent: pe desktop matricea de roluri, pe telefon lista
 * albă de mobil (unde agenția de ads nu are `/marketing`).
 */
export function useLandingRoute(): string {
  const { role } = useAuth()
  const isMobile = useIsMobile()
  return isMobile ? mobileDefaultRoute(role) : defaultRouteForRole(role)
}
