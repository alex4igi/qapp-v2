import type { AppRoute } from '@/lib/rolesMatrix'

export type HubTab = { label: string; path: AppRoute }

export const CLIENTI_TABS: HubTab[] = [
  { label: 'Persoane', path: '/clienti' },
  { label: 'Familii',  path: '/familii' },
]

export const RAPOARTE_TABS: HubTab[] = [
  { label: 'Overview',       path: '/overview' },
  { label: 'Panou',          path: '/analytics' },
  { label: 'Statistici',     path: '/statistici' },
  { label: 'Financiar',      path: '/financiar' },
  { label: 'CFO',            path: '/cfo' },
  { label: 'Start de sezon', path: '/start-sezon' },
]

export const EVENIMENTE_TABS: HubTab[] = [
  { label: 'Evenimente', path: '/evenimente' },
  { label: 'Spectacole', path: '/spectacole' },
  { label: 'Concursuri', path: '/concursuri' },
]

export const SMS_TABS: HubTab[] = [
  { label: 'SMS',               path: '/sms' },
  { label: 'Opt-out marketing', path: '/opt-out' },
]
