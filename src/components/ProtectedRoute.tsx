import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type AppRole } from '@/hooks/useAuth'
import { defaultRouteForRole, hasTeacherLens } from '@/lib/rolesMatrix'

type Props = {
  requireRole?: AppRole
  allowedRoles?: readonly AppRole[]
  /** Rută „a mea" de instructor: cere în plus un profil `teacheri` legat de cont. */
  requiresTeacherProfile?: boolean
}

export function ProtectedRoute({
  requireRole,
  allowedRoles,
  requiresTeacherProfile,
}: Props) {
  const { session, role, loading, teacherId, teacherLoading } = useAuth()

  // Profilul de instructor se rezolvă asincron după login — fără gardul ăsta un
  // manager care predă ar fi aruncat afară de pe /grupele-mele la refresh.
  if (loading || (requiresTeacherProfile && teacherLoading)) {
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

  if (requiresTeacherProfile && !hasTeacherLens(role, teacherId)) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }

  if (requireRole && role !== requireRole) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }

  return <Outlet />
}
