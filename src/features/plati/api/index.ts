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
  createIncasari,
  registerPlataFifo,
  resolveWorkshopGuest,
} from './incasari'

export {
  createDatorie,
  listDatoriiClient,
  registerPlataDatoriiFifo,
} from './datorii'

export type {
  ConflictHit,
  InchiriereRenter,
  CreateInchiriereParams,
  InchiriereDetail,
} from './inchirieri'
export {
  listTarifeInchiriere,
  checkInchiriereConflict,
  createInchiriere,
  updateInchiriere,
  cancelInchiriere,
  getInchiriereDetail,
} from './inchirieri'

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
  scheduleConfirmareInrolare,
  previewPoolDiscount,
  hasActiveEnrollmentOnCurs,
} from './enrollments'

export {
  adjustEnrollmentPrice,
  moveEnrollmentToCurs,
  convertSedintaInAbonament,
  deleteInrolareDuplicat,
  getReziliereRecalcPreview,
  recalcUltimaLunaReziliere,
  getMotivareAbsentaContext,
  aprobaMotivareAbsenta,
} from './enrollment-admin'
export type {
  ReziliereRecalcPreview,
  MotivareAbsentaContext,
  MotivareAbsentaResult,
} from './enrollment-admin'

export type {
  OpenSesiuneOcupare,
  OpenSesiuneRow,
  RezervareRow,
  RezervaLocParams,
  CreateOpenSesiuneParams,
} from './open-class'
export {
  listCursuriFacultative,
  getOpenSesiuneByDate,
  listOpenSesiuni,
  listRezervariSesiune,
  rezervaLocOpen,
  rezervaBonusOpen,
  createOpenSesiune,
  anuleazaRezervare,
} from './open-class'
