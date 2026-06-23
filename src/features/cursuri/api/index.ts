// Barrel public pentru modulul cursuri/api.

export { PAGE_SIZE } from './list'
export type { CursuriListParams, CursuriListResult } from './list'
export { listCursuri } from './list'

export { getCurs, createCurs, updateCurs, toggleCursArchived, deleteCurs } from './courses'

export type { CursEnrollment } from './enrollments'
export { getCursEnrollments } from './enrollments'

export type {
  CursOcupare,
  CursClientActiv,
  CursClientInactiv,
  CursDatorieRow,
  CursFaraPrezentaRow,
} from './profile'
export {
  getCursOcupare,
  getCursClientiActivi,
  getCursClientiInactivi,
  getCursDatorii,
  getCursFaraPrezenteRecente,
} from './profile'

export type { CursTeacherAsignment } from './teachers'
export { getCursTeacheri, setCursTeacheri } from './teachers'

export { activateReinscriere } from './reinscrieri'
