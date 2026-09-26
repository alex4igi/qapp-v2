import type { AppRole } from '@/hooks/useAuth'
import { canAccessRoute, type AppRoute } from '@/lib/rolesMatrix'
import { isTodayOnlyRoute } from '@/lib/todayOnlyMatrix'

export type NavItem = {
  label: string
  path: AppRoute
}

export type NavSection = {
  label: string
  /** Accent per secțiune (rail): iconul + bara de activ. */
  color: string
  items: NavItem[]
  /**
   * Secțiune-frunză: se randează ca un singur rând-link (fără acordeon), folosind
   * `items[0]` ca destinație. `matchPrefixes` = rutele care aprind evidențierea
   * (ex. hub-ul Administrare acoperă /setari, /audit, /contracte…).
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
      { label: 'Leads',      path: '/leads' },
      { label: 'Clienți',    path: '/clienti' },
      { label: 'Familii',    path: '/familii' },
      { label: 'Contracte',  path: '/contracte' },
      { label: 'Prezențe',   path: '/prezente' },
      { label: 'Absenți 21z', path: '/absente-21z' },
      { label: 'Evaluări',   path: '/evaluari' },
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
      { label: 'Teacheri',    path: '/teacheri' },
      { label: 'Metodologie', path: '/metodologic' },
      { label: 'Închirieri',  path: '/inchirieri' },
    ],
  },
  {
    label: 'Evenimente',
    color: '#f4649b',
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
      { label: 'Reconciliere ads', path: '/marketing' },
      { label: 'Campanii',        path: '/campanii' },
      { label: 'SMS',             path: '/sms' },
      { label: 'Ofertă publică',  path: '/oferta-publica' },
      { label: 'Feedback clienți', path: '/feedback' },
      { label: 'Opt-out',         path: '/opt-out' },
    ],
  },
  {
    label: 'Rapoarte',
    color: '#26c6c9',
    items: [
      { label: 'Panou',            path: '/analytics' },
      { label: 'CFO',              path: '/cfo' },
      { label: 'Overview',         path: '/overview' },
      { label: 'Financiar',        path: '/financiar' },
      { label: 'Statistici',       path: '/statistici' },
      { label: 'Start de sezon',   path: '/start-sezon' },
      { label: 'Scorecard CC',     path: '/scorecard' },
      { label: 'Raport KPI',       path: '/raport-kpi' },
      { label: 'Salarizare',       path: '/salarizare' },
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
      '/fise-incomplete',
      '/grile-kpi',
      '/organizatie',
    ],
    items: [{ label: 'Administrare', path: '/administrare' }],
  },
]

/** Ruta curentă aparține secțiunii? (frunză → matchPrefixes; altfel → item-uri) */
export function sectionMatches(section: NavSection, pathname: string): boolean {
  const prefixes = section.leaf
    ? (section.matchPrefixes ?? section.items.map((i) => i.path))
    : section.items.map((i) => i.path)
  return prefixes.some((p) => pathname.startsWith(p))
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
