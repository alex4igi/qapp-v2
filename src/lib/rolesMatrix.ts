import type { AppRole } from '@/hooks/useAuth'

// Single source of truth pentru matricea rol × pagină.
// Folosit de ProtectedRoute, navConfig și condiționalele UI.

// Grupuri reutilizabile (ierarhii)
export const ALL_STAFF: AppRole[] = ['owner', 'admin', 'manager', 'front_desk']
export const PRIVILEGED: AppRole[] = ['owner', 'admin', 'manager']
export const ADMIN_OR_OWNER: AppRole[] = ['owner', 'admin']
export const OWNER_ONLY: AppRole[] = ['owner']
export const WITH_TEACHER: AppRole[] = [...ALL_STAFF, 'teacher']
// Agenția externă de ads (read-only). NU face parte din ALL_STAFF: e un terț, nu
// personal — orice rută care i se deschide trebuie enumerată explicit.
export const WITH_MARKETING: AppRole[] = [...ALL_STAFF, 'marketing']

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
  // Fișele de lead sunt deschise și agenției de ads (verifică atribuirea pe
  // campanie). Editarea e blocată în UI (canEditLeads) și în RLS.
  '/leads': WITH_MARKETING,
  '/datorii': ALL_STAFF,
  // Lista zilnică de recuperare a cursanților tăcuți de 21 de zile. Titularul de
  // recepție o lucrează în fiecare zi, deci tot staff-ul non-teacher o vede;
  // ceasul de 48h se scrie doar prin RPC, nu direct din UI.
  '/absente-21z': ALL_STAFF,
  // păstrat doar pentru redirectul guardat /recuperare → /datorii
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
  // Dashboard analitic (numere & direcție) — doar owner + admin. Se ajunge la el
  // din meniu, nu prin aterizare (vezi defaultRouteForRole).
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
  '/campanii': WITH_MARKETING,
  '/reinscrieri': PRIVILEGED,
  // Reconciliere CRM ↔ Google/Meta Ads. Landing-ul rolului `marketing`.
  '/marketing': WITH_MARKETING,
  // Trimitere contracte + întreținerea șabloanelor: tot staff-ul, recepția
  // inclusă (ea pregătește dosarele familiilor).
  '/contracte': ALL_STAFF,
  // Editorul vizual modifică structura legală a contractelor, dar un șablon
  // deja folosit e imutabil în DB (`locked_at` + trg_contract_template_lock):
  // se poate doar clona într-o versiune nouă, care pornește inactivă.
  '/contracte/sabloane': ALL_STAFF,
  '/oferta-publica': PRIVILEGED,
  // Structura metodologică a sezonului (calendar + programe de lecții). Managementul
  // o stabilește; teacherii o consumă din fișa cursului și din pagina grupei.
  '/metodologic': PRIVILEGED,
  '/setari': PRIVILEGED,
  // Hub „Administrare" — landing cu tab-uri peste paginile de config (Setări,
  // Contracte, Inventar, Pontaj, Audit, Organizație). Deschis întregului staff
  // DOAR ca landing: fiecare pagină de sub hub își păstrează propriul gard de
  // rută (front_desk ajunge astfel la Contracte, nu și la Setări/Audit), iar
  // landing-ul redirectează spre primul tab accesibil rolului.
  '/administrare': ALL_STAFF,
  '/opt-out': PRIVILEGED,
  // Rutele „mele" de instructor: deschise oricărui rol, dar condiționate de
  // existența unui profil legat (vezi REQUIRES_TEACHER_PROFILE). Un manager care
  // predă le vede; un manager care nu predă, nu.
  '/salariul-meu': WITH_TEACHER,
  '/grupele-mele': WITH_TEACHER,
  '/pontaj-staff': PRIVILEGED,
  '/notificari': WITH_TEACHER,
  '/audit': PRIVILEGED,
  // Igienă de date: cine poate repara fișele (manager+) o și vede.
  '/fise-incomplete': PRIVILEGED,
  '/organizatie': OWNER_ONLY,
  // Configurarea bonusurilor per angajat (ponderi, praguri, sume). Nu e
  // PRIVILEGED: managerul PL folosește raportul lunar, dar nu setează numerele
  // după care e plătit omul lui.
  '/grile-kpi': ADMIN_OR_OWNER,
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
  // Agenția de ads nu are acces la Dashboard — ar intra în buclă de redirect.
  if (isMarketing(role)) return '/marketing'
  // Toată lumea, owner și admin inclusiv, aterizează pe Dashboard (operaționalul
  // zilei); „Panou" rămâne la un click în meniu. Pentru teacher, Dashboard-ul
  // afișează grupele zilei (filtrate via cursuri_teacheri M:N) și butoane de
  // marcare prezență.
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

export function isMarketing(role: AppRole): boolean {
  return role === 'marketing'
}

// Cine poate modifica lead-uri și campanii. Oglindește allowlist-ul din RLS
// (`leads_user_insert/update`): agenția de ads și teacherii citesc, nu scriu.
export function canEditLeads(role: AppRole): boolean {
  return isFrontDeskOrHigher(role)
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
    return (
      targetRole === 'manager' ||
      targetRole === 'front_desk' ||
      targetRole === 'teacher' ||
      targetRole === 'marketing'
    )
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
  marketing: 'Marketing (agenție)',
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
