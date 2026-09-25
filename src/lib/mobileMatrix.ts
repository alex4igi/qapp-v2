import type { AppRole } from '@/hooks/useAuth'
import {
  canAccessRoute,
  isMarketing,
  isPrivileged,
  isTeacher,
  type AppRoute,
} from './rolesMatrix'

// Ce se deschide pe telefon. Restul rutelor există în continuare, dar shell-ul
// mobil arată în locul lor ecranul „Disponibil doar pe desktop" — tabelele late,
// graficele și formularele de configurare nu se folosesc de pe telefon.
//
// Lista crește pe faze; o rută nouă „de mobil" se adaugă AICI, pe lângă cele trei
// locuri obișnuite (App.tsx, rolesMatrix.ts, navConfig.ts).
export const MOBILE_ROUTES = [
  // Fundație
  '/',
  '/notificari',
  // Instructor: prezența din sală și ce ține de propriile grupe
  '/grupa',
  '/clienti',
  '/grupele-mele',
  '/salariul-meu',
  '/evaluari',
  '/anunturi',
  '/inchirieri',
  // Recepție în mișcare
  '/leads',
  '/datorii',
  '/absente-21z',
  '/eveniment',
  '/situatie-zilnica',
  // Management: doar cifrele (pagina își ascunde singură graficele pe telefon)
  '/overview',
  // ⚠️ `/analytics` a fost SCOS intenționat: RPC-ul `get_pachet_luni` depășește
  // timeout-ul de 8s al PostgREST pentru un cont autentificat și întoarce 500,
  // iar React Query îl reîncearcă de 3 ori — 30+ secunde de așteptare pentru un
  // ecran care oricum nu se umple. Problema e veche și lovește și desktopul;
  // se rezolvă în DB, nu aici. Până atunci „cifrele" pe telefon = /overview.
] as const satisfies readonly AppRoute[]

/**
 * Prefixele acoperă și rutele de detaliu (`/grupa` → `/grupa/:id`). Potrivirea pe
 * `${ruta}/` e obligatorie: altfel `/eveniment` ar înghiți și `/evenimente`.
 */
export function isMobileRoute(pathname: string): boolean {
  return MOBILE_ROUTES.some(
    (r) => pathname === r || (r !== '/' && pathname.startsWith(`${r}/`)),
  )
}

export type MobileTabIcon =
  | 'azi'
  | 'grupe'
  | 'notif'
  | 'clienti'
  | 'leads'
  | 'datorii'
  | 'cifre'
  | 'situatie'

export type MobileTab = {
  label: string
  path: AppRoute
  icon: MobileTabIcon
}

// Bara de jos ține maxim 4 destinații + „Meniu". Ordinea = prioritatea personei;
// ce nu încape (sau nu e permis rolului) cade în meniu.
const MAX_TABS = 4

const TEACHER_TABS: MobileTab[] = [
  { label: 'Azi', path: '/', icon: 'azi' },
  { label: 'Grupele mele', path: '/grupele-mele', icon: 'grupe' },
  { label: 'Notificări', path: '/notificari', icon: 'notif' },
]

// Scurtăturile cerute de recepție. Clienții au ieșit din bară: lupa din bara de
// sus îi găsește mai repede decât un tab, iar lista rămâne în Meniu.
const DESK_TABS: MobileTab[] = [
  { label: 'Azi', path: '/', icon: 'azi' },
  { label: 'Situație', path: '/situatie-zilnica', icon: 'situatie' },
  { label: 'Overview', path: '/overview', icon: 'cifre' },
  { label: 'Datorii', path: '/datorii', icon: 'datorii' },
]

// Managementul lucrează aceleași scurtături; „cifrele" lui sunt /overview, care
// se încarcă imediat (spre deosebire de /analytics — vezi MOBILE_ROUTES).
const MANAGEMENT_TABS: MobileTab[] = DESK_TABS

export function mobileTabsFor(
  role: AppRole,
  teacherId: string | null = null,
): MobileTab[] {
  const source = isTeacher(role)
    ? TEACHER_TABS
    : isPrivileged(role)
      ? MANAGEMENT_TABS
      : DESK_TABS

  const out: MobileTab[] = []
  const seen = new Set<string>()
  for (const tab of source) {
    if (out.length >= MAX_TABS) break
    if (seen.has(tab.label)) continue
    // Filtrat și pe lista albă, nu doar pe rol: un tab care ar ateriza pe ecranul
    // „doar desktop" e o promisiune ruptă în bara de navigare.
    if (!isMobileRoute(tab.path)) continue
    if (!canAccessRoute(role, tab.path, teacherId)) continue
    seen.add(tab.label)
    out.push(tab)
  }
  return out
}


/**
 * Pe telefon toată lumea aterizează pe operaționalul zilei. Singura excepție e
 * agenția de ads: `/marketing` nu e în lista albă, deci ar cădea direct pe ecranul
 * „doar desktop".
 */
export function mobileDefaultRoute(role: AppRole): string {
  return isMarketing(role) ? '/leads' : '/'
}

/** Ce tab se aprinde pentru ruta curentă (rosterul unei grupe aparține lui „Azi"). */
export function activeTabPath(pathname: string, tabs: MobileTab[]): string | null {
  if (pathname === '/' || pathname.startsWith('/grupa/')) {
    return tabs.some((t) => t.path === '/') ? '/' : null
  }
  const matches = tabs
    .filter((t) => t.path !== '/')
    .filter((t) => pathname === t.path || pathname.startsWith(`${t.path}/`))
    .sort((a, b) => b.path.length - a.path.length)
  return matches[0]?.path ?? null
}
