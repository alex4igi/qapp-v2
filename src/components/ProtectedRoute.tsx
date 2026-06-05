import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type AppRole } from '@/hooks/useAuth'
import { defaultRouteForRole } from '@/lib/rolesMatrix'

type Props = {
  requireRole?: AppRole
  allowedRoles?: readonly AppRole[]
}

export function ProtectedRoute({ requireRole, allowedRoles }: Props) {
  const { session, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-quasar-gray">
        Se încarcă…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }

  if (requireRole && role !== requireRole) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }

  return <Outlet />
}
