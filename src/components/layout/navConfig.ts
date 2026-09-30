import type { AppRole } from '@/hooks/useAuth'
import { canAccessRoute, type AppRoute } from '@/lib/rolesMatrix'
import { isTodayOnlyRoute } from '@/lib/todayOnlyMatrix'

export type NavItem = {
  label: string
  path: AppRoute
  /** Alte rute care aprind item-ul (ex. Clienți acoperă și tabul Familii). */
  matchPrefixes?: string[]
}

export type NavSection = {
  label: string
  /** Accent per secțiune (rail): iconul + bara de activ. */
  color: string
  items: NavItem[]
  /**
   * Secțiune-frunză: se randează ca un singur rând-link (fără acordeon), folosind
   * `items[0]` ca destinație — după filtrarea pe rol, deci primul tab permis.
   * `matchPrefixes` = rutele care aprind evidențierea (ex. hub-ul Administrare
   * acoperă /setari, /audit…).
   */
  leaf?: boolean
  matchPrefixes?: string[]
}

// Lista completă a item-urilor din nav. Vizibilitatea per rol se derivă
// automat din `ROUTE_ACCESS` din `rolesMatrix.ts`.
export const navSections: NavSection[] = [
  {
    label: 'Clienți',
    color: '#4c9aff',
    items: [
      { label: 'Leads',       path: '/leads' },
      // Persoane + Familii sub un tab-bar comun (HubLayout).
      { label: 'Clienți',     path: '/clienti', matchPrefixes: ['/clienti', '/familii'] },
      { label: 'Contracte',   path: '/contracte' },
      { label: 'Absenți 21z', path: '/absente-21z' },
      { label: 'Recomandări', path: '/recomandari' },
      { label: 'Preînscrieri', path: '/preinscrieri' },
    ],
  },
  {
    label: 'Încasări',
    color: '#2fbf71',
    items: [
      { label: 'Plăți',            path: '/plati' },
      { label: 'Situație zilnică', path: '/situatie-zilnica' },
      { label: 'Datorii',          path: '/datorii' },
      { label: 'Facturare',        path: '/facturare' },
      { label: 'Reînscrieri',      path: '/reinscrieri' },
      { label: 'Vouchere',         path: '/vouchere' },
    ],
  },
  {
    label: 'Cursuri',
    color: '#f59042',
    items: [
      { label: 'Cursuri',     path: '/cursuri' },
      { label: 'Prezențe',    path: '/prezente' },
      { label: 'Evaluări',    path: '/evaluari' },
      { label: 'Metodologie', path: '/metodologic' },
      { label: 'Închirieri',  path: '/inchirieri' },
    ],
  },
  {
    // Hub cu tab-uri (EVENIMENTE_TABS). Rosterul `/eveniment/:id` nu intră aici:
    // e pagina de mobil / „doar azi", nu lista.
    label: 'Evenimente',
    color: '#f4649b',
    leaf: true,
    matchPrefixes: ['/evenimente', '/spectacole', '/concursuri'],
    items: [
      { label: 'Evenimente', path: '/evenimente' },
      { label: 'Spectacole', path: '/spectacole' },
      { label: 'Concursuri', path: '/concursuri' },
    ],
  },
  {
    label: 'Marketing',
    color: '#a78bfa',
    items: [
      { label: 'Campanii',         path: '/campanii' },
      { label: 'Reconciliere ads', path: '/marketing' },
      { label: 'SMS',              path: '/sms', matchPrefixes: ['/sms', '/opt-out'] },
      { label: 'Ofertă publică',   path: '/oferta-publica' },
      { label: 'Feedback clienți', path: '/feedback' },
    ],
  },
  {
    label: 'Echipă',
    color: '#94d82d',
    items: [
      { label: 'Teacheri',     path: '/teacheri' },
      { label: 'Raport KPI',   path: '/raport-kpi' },
      { label: 'Scorecard CC', path: '/scorecard' },
      { label: 'Salarizare',   path: '/salarizare' },
    ],
  },
  {
    // Hub cu tab-uri (RAPOARTE_TABS). Pe telefon rămâne doar Overview — `MenuSheet`
    // filtrează item-urile prin `isMobileRoute`.
    label: 'Rapoarte',
    color: '#26c6c9',
    leaf: true,
    matchPrefixes: ['/overview', '/analytics', '/statistici', '/financiar', '/cfo', '/start-sezon'],
    items: [
      { label: 'Overview',       path: '/overview' },
      { label: 'Panou',          path: '/analytics' },
      { label: 'Statistici',     path: '/statistici' },
      { label: 'Financiar',      path: '/financiar' },
      { label: 'CFO',            path: '/cfo' },
      { label: 'Start de sezon', path: '/start-sezon' },
    ],
  },
  {
    label: 'Personal',
    color: '#e7b84b',
    items: [
      { label: 'Grupele mele', path: '/grupele-mele' },
      { label: 'Salariul meu', path: '/salariul-meu' },
    ],
  },
  {
    // Hub cu tab-uri — cele 6 pagini de config au ieșit din rail. Anunțuri +
    // Feedback aplicație trăiesc în meniul contului (AccountMenu). Contracte a
    // ieșit din hub — e submeniu la Clienți.
    label: 'Administrare',
    color: '#9aa3b2',
    leaf: true,
    matchPrefixes: [
      '/administrare',
      '/setari',
      '/inventar',
      '/pontaj-staff',
      '/audit',
      '/utilizare',
      '/fise-incomplete',
      '/grile-kpi',
      '/organizatie',
    ],
    items: [{ label: 'Administrare', path: '/administrare' }],
  },
]

/** Ruta curentă aparține item-ului? (`matchPrefixes` sau propria rută) */
export function itemMatches(item: NavItem, pathname: string): boolean {
  return (item.matchPrefixes ?? [item.path]).some((p) => pathname.startsWith(p))
}

/** Ruta curentă aparține secțiunii? (frunză → matchPrefixes; altfel → item-uri) */
export function sectionMatches(section: NavSection, pathname: string): boolean {
  if (section.leaf && section.matchPrefixes) {
    return section.matchPrefixes.some((p) => pathname.startsWith(p))
  }
  return section.items.some((i) => itemMatches(i, pathname))
}

export function visibleSections(
  role: AppRole,
  teacherId: string | null = null,
  /** Modul „doar azi": meniul păstrează doar destinațiile din lista lui albă. */
  todayOnly = false,
): NavSection[] {
  const isVisible = (item: NavItem) =>
    canAccessRoute(role, item.path, teacherId) &&
    (!todayOnly || isTodayOnlyRoute(item.path))
  return navSections
    .map((s) => ({ ...s, items: s.items.filter(isVisible) }))
    .filter((s) => s.items.length > 0)
}
