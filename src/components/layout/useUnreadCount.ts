import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute } from '@/lib/rolesMatrix'
import { getUnreadCount } from '@/features/notificari/api'

/** Contorul de notificări necitite pentru clopoțel (bara desktop + cea mobilă). */
export function useUnreadCount(): { enabled: boolean; count: number } {
  const { role } = useAuth()
  const enabled = canAccessRoute(role, '/notificari')
  const { data } = useQuery({
    queryKey: ['notificari-unread'],
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: 60_000,
  })
  return { enabled, count: data ?? 0 }
}
