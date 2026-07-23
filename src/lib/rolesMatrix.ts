import type { AppRole } from '@/hooks/useAuth'

// Single source of truth pentru matricea rol × pagină.
// Folosit de ProtectedRoute, navConfig și condiționalele UI.

// Grupuri reutilizabile (ierarhii)
export const ALL_STAFF: AppRole[] = ['owner', 'admin', 'manager', 'front_desk']
export const PRIVILEGED: AppRole[] = ['owner', 'admin', 'manager']
export const ADMIN_OR_OWNER: AppRole[] = ['owner', 'admin']
export const OWNER_ONLY: AppRole[] = ['owner']
export const WITH_TEACHER: AppRole[] = [...ALL_STAFF, 'teacher']

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
  // Calendar închirieri săli: front_desk+ rezervă plătit; teacher își vede/rezervă
  // propria practică gratis. Gating de acțiune (tarif) în tab-ul de rezervare.
  '/inchirieri': WITH_TEACHER,
  '/plati': ALL_STAFF,
  // Facturare FGO: recepția lucrează lista; upload-ul extrasului e gardat la admin/owner
  // în pagină + în edge function (acțiunea `ingest`).
  '/facturare': ALL_STAFF,
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
  // Dashboard analitic (numere & direcție) — doar owner + admin. E și landing-ul
  // lor (vezi defaultRouteForRole).
  '/analytics': ADMIN_OR_OWNER,
  // Zonă dedicată CFO (finanțe) — izolată de operațional. Doar owner + admin.
  '/cfo': ADMIN_OR_OWNER,
  '/scorecard': PRIVILEGED,
  '/vouchere': PRIVILEGED,
  '/inventar': PRIVILEGED,
  // Lista de evenimente e vizibilă întregului staff (recepția trebuie să ajungă la
  // roster pentru încasări + înscriere participanți). Acțiunile de creare/editare/
  // ștergere a evenimentului rămân la manager+ (gating intern în pagină + RLS).
  '/evenimente': ALL_STAFF,
  // Rosterul unui eveniment (participanți + încasare bilet) — tot staff-ul.
  '/eveniment': ALL_STAFF,
  '/concursuri': PRIVILEGED,
  // Spectacole / recitaluri (producție lineup) — owner/admin/manager. Teacherii pot
  // fi responsabili de act, dar gestiunea rămâne la privilegiați (ca la concursuri).
  '/spectacole': PRIVILEGED,
  '/campanii': ALL_STAFF,
  '/reinscrieri': PRIVILEGED,
  '/contracte': PRIVILEGED,
  // Editor vizual de template-uri — modifică structura legală a contractelor,
  // mai restrâns decât trimiterea din /contracte (care include manager).
  '/contracte/sabloane': ADMIN_OR_OWNER,
  '/oferta-publica': PRIVILEGED,
  // Structura metodologică a sezonului (calendar + programe de lecții). Managementul
  // o stabilește; teacherii o consumă din fișa cursului și din pagina grupei.
  '/metodologic': PRIVILEGED,
  '/setari': PRIVILEGED,
  '/opt-out': PRIVILEGED,
  // Rutele „mele" de instructor: deschise oricărui rol, dar condiționate de
  // existența unui profil legat (vezi REQUIRES_TEACHER_PROFILE). Un manager care
  // predă le vede; un manager care nu predă, nu.
  '/salariul-meu': WITH_TEACHER,
  '/grupele-mele': WITH_TEACHER,
  '/pontaj-staff': PRIVILEGED,
  '/notificari': WITH_TEACHER,
  '/audit': PRIVILEGED,
  '/organizatie': OWNER_ONLY,
} as const satisfies Record<string, readonly AppRole[]>

export type AppRoute = keyof typeof ROUTE_ACCESS

// Rute care, pe lângă rol, cer un profil de instructor legat de cont. Fac
// „predatul" ortogonal rolului: aceleași pagini pentru un teacher pur și pentru
// un manager care predă.
export const REQUIRES_TEACHER_PROFILE = new Set<AppRoute>([
  '/salariul-meu',
  '/grupele-mele',
])

/**
 * Discriminantul canonic pentru „arată-i datele lui de instructor".
 *
 * Rămâne adevărat pentru rolul `teacher` chiar fără profil legat, ca un cont de
 * instructor neconfigurat să nu-și piardă meniul (vede pagina goală + eroarea de
 * configurare, ca înainte).
 */
export function hasTeacherLens(
  role: AppRole,
  teacherId: string | null,
): boolean {
  return isTeacher(role) || Boolean(teacherId)
}

export function canAccessRoute(
  role: AppRole,
  path: AppRoute,
  teacherId: string | null = null,
): boolean {
  if (!(ROUTE_ACCESS[path] as readonly AppRole[]).includes(role)) return false
  if (REQUIRES_TEACHER_PROFILE.has(path)) return hasTeacherLens(role, teacherId)
  return true
}

export function defaultRouteForRole(role: AppRole): string {
  // Owner + admin aterizează pe dashboard-ul analitic („numere & direcție") — pe
  // ei nu-i interesează ce ore sunt azi, ci numerele. Operaționalul zilei rămâne
  // la 1 click (buton „Operațional zi" + meniu).
  if (isAdminOrHigher(role)) return '/analytics'
  // Restul aterizează pe Dashboard. Pentru teacher, Dashboard-ul afișează grupele
  // zilei (filtrate via cursuri_teacheri M:N) și butoane de marcare prezență.
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

// front_desk și mai sus (tot staff-ul non-teacher)
export function isFrontDeskOrHigher(role: AppRole): boolean {
  return role === 'front_desk' || isManagerOrHigher(role)
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

// Cine trimite mesaje către membrii unei grupe (ajung în 🔔 din portal).
// Recepția (front_desk) nu — oglindește gardul din RPC-ul send_anunt_client.
export function canMesajGrupa(role: AppRole): boolean {
  return isTeacher(role) || isManagerOrHigher(role)
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

/**
 * Eticheta afișată pentru un cont: „Manager + Instructor" pentru cine are și
 * profil de instructor legat.
 *
 * Model tehnic (rol + profil ortogonale) ≠ model mental („e manager ȘI predă").
 * Compunerea se face doar la afișare — nu există rol compus în JWT sau în DB.
 */
export function roleLabel(role: AppRole, teacherId: string | null): string {
  if (isTeacher(role) || !teacherId) return ROLE_LABEL[role]
  return `${ROLE_LABEL[role]} + Instructor`
}
