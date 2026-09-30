import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLandingRoute } from '@/hooks/useLandingRoute'
import { canAccessRoute } from '@/lib/rolesMatrix'
import { HubLayout } from './HubLayout'
import type { HubTab } from './hubTabs'

// Hub „Administrare": paginile de config, scoase din rail și adunate sub un
// tab-bar comun. Fiecare tab e un link către ruta existentă (paths neschimbate,
// deci deep-link-urile și linkurile interne rămân valide). Contracte a ieșit de
// aici — e submeniu la Clienți (nu mai trăiește sub tab-bar-ul de mai jos).
const TABS: HubTab[] = [
  { label: 'Setări',          path: '/setari' },
  { label: 'Inventar',        path: '/inventar' },
  { label: 'Pontaj',          path: '/pontaj-staff' },
  { label: 'Audit',           path: '/audit' },
  { label: 'Utilizare',       path: '/utilizare' },
  { label: 'Fișe incomplete', path: '/fise-incomplete' },
  { label: 'Grile KPI',       path: '/grile-kpi' },
  { label: 'Organizație',     path: '/organizatie' },
]

/**
 * Landing-ul `/administrare`: sare pe primul tab pe care rolul chiar îl poate
 * deschide. Hub-ul e acum PRIVILEGED (toate tab-urile sunt manager+) — de când
 * Contracte a ieșit din el, recepția nu mai are motiv să intre aici.
 */
export function AdministrareIndex() {
  const { role } = useAuth()
  const landing = useLandingRoute()
  const first = TABS.find((t) => canAccessRoute(role, t.path))
  return <Navigate to={first?.path ?? landing} replace />
}

export function AdministrareLayout() {
  return <HubLayout title="Administrare" tabs={TABS} />
}
