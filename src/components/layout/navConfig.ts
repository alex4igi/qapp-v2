import type { AppRole } from '@/hooks/useAuth'
import { ROUTE_ACCESS, type AppRoute } from '@/lib/rolesMatrix'

export type NavItem = {
  label: string
  path: AppRoute
}

export type NavSection = {
  label: string
  items: NavItem[]
}

// Lista completă a item-urilor din nav. Vizibilitatea per rol se derivă
// automat din `ROUTE_ACCESS` din `rolesMatrix.ts`.
export const navSections: NavSection[] = [
  {
    label: 'Clienți',
    items: [
      { label: 'Clienți',        path: '/clienti' },
      { label: 'Familii',        path: '/familii' },
      { label: 'Leads',          path: '/leads' },
      { label: 'Recuperare',     path: '/recuperare' },
      { label: 'Plăți',          path: '/plati' },
      { label: 'Facturare',      path: '/facturare' },
      { label: 'Prezențe',       path: '/prezente' },
      { label: 'Evaluări',       path: '/evaluari' },
      { label: 'Notificări SMS', path: '/sms' },
      { label: 'Opt-out',        path: '/opt-out' },
    ],
  },
  {
    label: 'Statistici',
    items: [
      { label: 'Panou (numere)', path: '/analytics' },
      { label: 'CFO (finanțe)', path: '/cfo' },
      { label: 'Overview', path: '/overview' },
      { label: 'Situație zilnică', path: '/situatie-zilnica' },
      { label: 'Financiar',        path: '/financiar' },
      { label: 'Statistici',       path: '/statistici' },
      { label: 'Scorecard CC',     path: '/scorecard' },
    ],
  },
  {
    label: 'Studio',
    items: [
      { label: 'Cursuri',     path: '/cursuri' },
      { label: 'Închirieri',  path: '/inchirieri' },
      { label: 'Teacheri',    path: '/teacheri' },
      { label: 'Feedback',    path: '/feedback' },
      { label: 'Vouchere',    path: '/vouchere' },
      { label: 'Inventar',    path: '/inventar' },
      { label: 'Evenimente',  path: '/evenimente' },
      { label: 'Concursuri',  path: '/concursuri' },
      { label: 'Campanii',    path: '/campanii' },
      { label: 'Reînscrieri',    path: '/reinscrieri' },
      { label: 'Ofertă publică', path: '/oferta-publica' },
      { label: 'Setări',         path: '/setari' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { label: 'Salariul meu',       path: '/salariul-meu' },
      // Anunțuri + Feedback aplicație trăiesc în meniul contului (vezi
      // AccountMenu), ca să nu fie dublate aici.
      { label: 'Audit log',          path: '/audit' },
      { label: 'Pontaj staff',       path: '/pontaj-staff' },
      { label: 'Organizație',        path: '/organizatie' },
    ],
  },
]
// Note: /pontaj-staff (admin+manager) va fi adăugat în Phase 8.

export function visibleSections(role: AppRole): NavSection[] {
  const isVisible = (item: NavItem) =>
    (ROUTE_ACCESS[item.path] as readonly AppRole[]).includes(role)
  return navSections
    .map((s) => ({ ...s, items: s.items.filter(isVisible) }))
    .filter((s) => s.items.length > 0)
}
