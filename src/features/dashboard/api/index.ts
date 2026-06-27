// Barrel public pentru modulul dashboard/api.

export type { ZiSaptamana } from './helpers'
export { dayOfWeekRO, todayIso, isoDaysAgo } from './helpers'

export type { DashboardStats } from './stats'
export { getDashboardStats } from './stats'

export type { DashboardKpis } from './kpi'
export { getDashboardKpis } from './kpi'

export type { DashboardCourse } from './courses'
export { getDashboardCourses } from './courses'

export type { DashboardEvent } from './events'
export { getDashboardEvents } from './events'

export type { DashboardChartRow } from './chart'
export { getDashboardChart } from './chart'

export type {
  RosterStatus,
  RosterKind,
  GrupaRosterRow,
  GrupaDashboard,
} from './grupa'
export { getGrupaDashboard } from './grupa'

export type {
  IncasareAziRow,
  ProgramareAziRow,
  RestantierAziRow,
} from './preview'
export { getIncasariAzi, getProgramariAzi, getRestantieriAzi } from './preview'
