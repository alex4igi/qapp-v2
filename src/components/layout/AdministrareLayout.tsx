import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, defaultRouteForRole, type AppRoute } from '@/lib/rolesMatrix'

// Hub „Administrare": paginile de config, scoase din rail și adunate sub un
// tab-bar comun. Fiecare tab e un link către ruta existentă (paths neschimbate,
// deci deep-link-urile și linkurile interne rămân valide).
const TABS: { label: string; path: AppRoute }[] = [
  { label: 'Setări',          path: '/setari' },
  { label: 'Contracte',       path: '/contracte' },
  { label: 'Inventar',        path: '/inventar' },
  { label: 'Pontaj',          path: '/pontaj-staff' },
  { label: 'Audit',           path: '/audit' },
  { label: 'Fișe incomplete', path: '/fise-incomplete' },
  { label: 'Organizație',     path: '/organizatie' },
]

/**
 * Landing-ul `/administrare`: sare pe primul tab pe care rolul chiar îl poate
 * deschide. Hub-ul e accesibil întregului staff, dar paginile de sub el nu sunt
 * (recepția vede doar Contracte) — o țintă fixă ar trimite-o într-un 403.
 */
export function AdministrareIndex() {
  const { role } = useAuth()
  const first = TABS.find((t) => canAccessRoute(role, t.path))
  return <Navigate to={first?.path ?? defaultRouteForRole(role)} replace />
}

export function AdministrareLayout() {
  const { role } = useAuth()
  const tabs = TABS.filter((t) => canAccessRoute(role, t.path))

  return (
    <div>
      <div className="mb-4 border-b border-line">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Administrare
        </div>
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                [
                  '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
                  isActive
                    ? 'border-quasar-yellow font-semibold text-ink'
                    : 'border-transparent font-medium text-muted-2 hover:text-ink',
                ].join(' ')
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  )
}
