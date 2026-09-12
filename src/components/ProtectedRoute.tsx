import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type AppRole } from '@/hooks/useAuth'
import { useLandingRoute } from '@/hooks/useLandingRoute'
import { hasTeacherLens } from '@/lib/rolesMatrix'

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
  const { session, role, loading, bootSlow, teacherId, teacherLoading } = useAuth()
  const landing = useLandingRoute()

  // Profilul de instructor se rezolvă asincron după login — fără gardul ăsta un
  // manager care predă ar fi aruncat afară de pe /grupele-mele la refresh.
  if (loading || (requiresTeacherProfile && teacherLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-quasar-gray">
        <span>Se încarcă…</span>
        {bootSlow && (
          <span className="text-sm">
            Reînnoim sesiunea — durează mai mult ca de obicei.
          </span>
        )}
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={landing} replace />
  }

  if (requiresTeacherProfile && !hasTeacherLens(role, teacherId)) {
    return <Navigate to={landing} replace />
  }

  if (requireRole && role !== requireRole) {
    return <Navigate to={landing} replace />
  }

  return <Outlet />
}
