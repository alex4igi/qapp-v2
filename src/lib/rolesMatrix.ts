import type { AppRole } from '@/hooks/useAuth'

// Single source of truth pentru matricea rol × pagină.
// Folosit de ProtectedRoute, navConfig și condiționalele UI.

// Grupuri reutilizabile (ierarhii)
export const ALL_STAFF: AppRole[] = ['owner', 'admin', 'manager', 'front_desk']
export const PRIVILEGED: AppRole[] = ['owner', 'admin', 'manager']
export const ADMIN_OR_OWNER: AppRole[] = ['owner', 'admin']
export const OWNER_ONLY: AppRole[] = ['owner']
export const WITH_TEACHER: AppRole[] = [...ALL_STAFF, 'teacher']
export const TEACHER_ONLY: AppRole[] = ['teacher']

// Matrice rută → roluri permise
// Notă: gating-ul de acțiuni (create/edit/delete) intern paginii se face
// cu helpers (`isPrivileged`, `isAdminOrHigher`) — această matrice e doar
// pentru accesul la rută.
export const ROUTE_ACCESS = {
  '/': WITH_TEACHER,
  '/overview': ALL_STAFF,
  '/clienti': ALL_STAFF,
  '/familii': ALL_STAFF,
  '/cursuri': WITH_TEACHER,
  '/teacheri': ALL_STAFF,
  '/prezente': WITH_TEACHER,
  '/plati': ALL_STAFF,
  '/leads': ALL_STAFF,
  '/recuperare': ALL_STAFF,
  '/sms': ALL_STAFF,
  '/feedback': ALL_STAFF,
  '/feedback-app': WITH_TEACHER,
  '/anunturi': WITH_TEACHER,
  '/grupa': WITH_TEACHER,
  '/situatie-zilnica': ALL_STAFF,
  '/evaluari': WITH_TEACHER,
  // Front_desk vede rapoartele (satisfacția muncii). Tabul „Cheltuieli"
  // (salarii) din /financiar e ascuns intern pentru non-privileged.
  '/financiar': ALL_STAFF,
  '/statistici': ALL_STAFF,
  '/scorecard': PRIVILEGED,
  '/vouchere': PRIVILEGED,
  '/inventar': PRIVILEGED,
  '/evenimente': PRIVILEGED,
  '/concursuri': PRIVILEGED,
  '/campanii': ALL_STAFF,
  '/reinscrieri': PRIVILEGED,
  '/oferta-publica': PRIVILEGED,
  '/setari': PRIVILEGED,
  '/opt-out': PRIVILEGED,
  '/salariul-meu': TEACHER_ONLY,
  '/pontaj-staff': PRIVILEGED,
  '/notificari': WITH_TEACHER,
  '/audit': PRIVILEGED,
  '/organizatie': OWNER_ONLY,
} as const satisfies Record<string, readonly AppRole[]>

export type AppRoute = keyof typeof ROUTE_ACCESS

export function canAccessRoute(role: AppRole, path: AppRoute): boolean {
  return (ROUTE_ACCESS[path] as readonly AppRole[]).includes(role)
}

export function defaultRouteForRole(_role: AppRole): string {
  // Toate rolurile aterizează pe Dashboard. Pentru teacher, Dashboard-ul
  // afișează grupele zilei (filtrate via cursuri_teacheri M:N) și butoane
  // de marcare prezență.
  return '/'
}

// Helpers de rol
export function isOwner(role: AppRole): boolean {
  return role === 'owner'
}

export function isAdminOrHigher(role: AppRole): boolean {
  return role === 'admin' || role === 'owner'
}

export function isManagerOrHigher(role: AppRole): boolean {
  return role === 'manager' || isAdminOrHigher(role)
}

export function isPrivileged(role: AppRole): boolean {
  return isManagerOrHigher(role)
}

export function isFrontDesk(role: AppRole): boolean {
  return role === 'front_desk'
}

export function isTeacher(role: AppRole): boolean {
  return role === 'teacher'
}

// Capabilități cross-cutting
export function canChangeLocatie(role: AppRole): boolean {
  return isManagerOrHigher(role)
}

export function canViewAllLocatii(role: AppRole): boolean {
  return isManagerOrHigher(role)
}

// Doar owner promovează la admin/owner
export function canManageRole(currentRole: AppRole, targetRole: AppRole): boolean {
  if (currentRole === 'owner') return true
  if (currentRole === 'admin') {
    return targetRole === 'manager' || targetRole === 'front_desk' || targetRole === 'teacher'
  }
  if (currentRole === 'manager') {
    return targetRole === 'front_desk' || targetRole === 'teacher'
  }
  return false
}

// Etichete pentru UI
export const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  front_desk: 'Front Desk',
  teacher: 'Instructor',
}
