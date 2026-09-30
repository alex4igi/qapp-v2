import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { isMobileRoute } from '@/lib/mobileMatrix'
import { canAccessRoute } from '@/lib/rolesMatrix'
import type { HubTab } from './hubTabs'

/**
 * Tab-bar comun deasupra unor pagini adunate sub o singură intrare de meniu.
 * Fiecare tab e un link către ruta existentă (paths neschimbate → deep-link-urile
 * și Back-ul rămân valide). Tabul apare doar dacă rolul îl poate deschide; pe
 * telefon, doar dacă pagina e adaptată — altfel ar duce pe „doar pe desktop".
 * Cu un singur tab rămas, bara nu mai are ce alege și nu se arată.
 */
export function HubLayout({ title, tabs }: { title: string; tabs: HubTab[] }) {
  const { role, teacherId } = useAuth()
  const isMobile = useIsMobile()
  const visible = tabs.filter(
    (t) => canAccessRoute(role, t.path, teacherId) && (!isMobile || isMobileRoute(t.path)),
  )

  return (
    <div>
      {visible.length > 1 && (
        <div className="mb-4 border-b border-line">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {title}
          </div>
          <div className="flex flex-wrap gap-1">
            {visible.map((tab) => (
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
      )}
      <Outlet />
    </div>
  )
}
