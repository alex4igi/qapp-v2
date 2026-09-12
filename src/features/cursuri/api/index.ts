// Barrel public pentru modulul cursuri/api.

export { PAGE_SIZE } from './list'
export type { CursuriListParams, CursuriListResult, CursuriScope } from './list'
export { listCursuri, listCursuriFilterOptions, getCursuriChecklistFields } from './list'
export type { CursChecklistRow } from './list'

export {
  getCurs,
  createCurs,
  updateCurs,
  toggleCursArchived,
  deleteCurs,
  countPrezenteCurs,
} from './courses'

export type { CursEnrollment } from './enrollments'
export { getCursEnrollments } from './enrollments'

export type {
  CursOcupare,
  CursClientActiv,
  CursClientInactiv,
  CursClientFaraDoc,
  CursDatorieRow,
  CursFaraPrezentaRow,
  CursLuna,
  CursIstoricRow,
} from './profile'
export {
  getCursOcupare,
  getCursClientiActivi,
  getCursClientiInactivi,
  getCursClientiFaraDocumente,
  getCursDatorii,
  getCursFaraPrezenteRecente,
  getCursLuni,
  getCursIstoric,
  lunaCurenta,
} from './profile'

export type { CursTeacherAsignment } from './teachers'
export { getCursTeacheri, setCursTeacheri } from './teachers'

export { activateReinscriere } from './reinscrieri'
