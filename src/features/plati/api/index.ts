// Barrel public pentru modulul plati/api.
// Toate importurile externe `from '@/features/plati/api'` și interne `from './api'`
// rezolvă aici și primesc același set de funcții ca în fostul api.ts flat.

export { PAGE_SIZE } from './list'
export type { PlatiFiltre, PlataRow, SumarPlati } from './list'
export { listPlati, exportPlati, getSumarPlati } from './list'

export type { IncasareEditable } from './incasare-edit'
export {
  getIncasareForEdit,
  updateIncasareWithAudit,
  deleteIncasareWithAudit,
} from './incasare-edit'

export type { SezonOption } from './sezoane'
export { listSezoane, getSezonForDate } from './sezoane'

export {
  countSessionsBetween,
  enumerateMonths,
  endOfMonth,
} from './calendar'

export type { WorkshopGuestResult, PlanIntegral, PlanIntegralRata } from './incasari'
export {
  getEnrollmentIncasari,
  getPlanPlataIntegrala,
  incaseazaPlataIntegrala,
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
  AdjustInchiriereResult,
} from './inchirieri'
export {
  listTarifeInchiriere,
  checkInchiriereConflict,
  createInchiriere,
  updateInchiriere,
  adjustInchirierePrice,
  cancelInchiriere,
  getInchiriereDetail,
  collectInchiriere,
} from './inchirieri'

export type { BiletSursaOption, InventarOptionRow } from './sources'
export { listBiletSurse, listInventarOptiuni } from './sources'

export type { TipInrolare, CreateInrolariParams } from './enrollments'
export {
  createEnrollment,
  updateEnrollment,
  getInrolariClientSezon,
  getInrolariRestanteAnterioare,
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
  getEnrollmentPaid,
  getClientOutstandingCharges,
  getClientCredit,
  useClientCredit,
  moveEnrollmentToCurs,
  previewMoveEnrollment,
  corecteazaDataInrolare,
  getSedinteToAbonamentPreview,
  convertSedinteInAbonament,
  getAbonamentToSedintePreview,
  convertAbonamentInSedinte,
  deleteInrolareDuplicat,
  getReziliereRecalcPreview,
  recalcUltimaLunaReziliere,
  getMotivareAbsentaContext,
  aprobaMotivareAbsenta,
} from './enrollment-admin'
export type {
  SurplusAction,
  AdjustPriceResult,
  SurplusTarget,
  UseCreditResult,
  ReziliereRecalcPreview,
  SedinteToAbonamentPreview,
  AbonamentToSedintePreview,
  MotivareAbsentaContext,
  MotivareAbsentaResult,
  MoveEnrollmentResult,
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
