// Barrel public pentru modulul plati/api.
// Toate importurile externe `from '@/features/plati/api'` și interne `from './api'`
// rezolvă aici și primesc același set de funcții ca în fostul api.ts flat.

export { PAGE_SIZE } from './list'
export type { PlatiListParams, PlatiListResult } from './list'
export { listPlatiInrolari } from './list'

export type { SezonOption } from './sezoane'
export { listSezoane, getSezonForDate } from './sezoane'

export {
  countSessionsBetween,
  enumerateMonths,
  endOfMonth,
} from './calendar'

export type { WorkshopGuestResult } from './incasari'
export {
  getEnrollmentIncasari,
  createIncasare,
  registerPlataFifo,
  resolveWorkshopGuest,
} from './incasari'

export type { BiletSursaOption, InventarOptionRow } from './sources'
export { listBiletSurse, listInventarOptiuni } from './sources'

export type { TipInrolare, CreateInrolariParams } from './enrollments'
export {
  createEnrollment,
  updateEnrollment,
  getInrolariClientSezon,
  getCursForInrolare,
  listCursuriPentruInrolare,
  createInrolari,
  rezilizaInrolari,
} from './enrollments'

export {
  adjustEnrollmentPrice,
  moveEnrollmentToCurs,
} from './enrollment-admin'
