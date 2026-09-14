// Barrel public pentru modulul cursuri/api.

export { PAGE_SIZE } from './list'
export type { CursuriListParams, CursuriListResult, CursuriScope } from './list'
export { listCursuri, listCursuriFilterOptions, getCursuriChecklistFields } from './list'
export type { CursChecklistRow } from './list'

export {
  getCurs,
  createCurs,
  updateCurs,
  setCursSuspendare,
  cursActivInLuna,
  getSuspendareDeschisa,
  deleteCurs,
  countPrezenteCurs,
} from './courses'

export type { CursSuspendare } from './courses'
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
  getCursuriDatorii,
  getCursFaraPrezenteRecente,
  getCursLuni,
  getCursIstoric,
  lunaCurenta,
} from './profile'

export type { CursTeacherAsignment } from './teachers'
export { getCursTeacheri, setCursTeacheri } from './teachers'

export { activateReinscriere } from './reinscrieri'

export type { CursantAfectat, TriajSuspendare, TriajRezultat } from './suspendare'
export {
  getCursantiAfectatiDeSuspendare,
  aplicaTriajSuspendare,
} from './suspendare'

export type { GrupaPragMinim, LunaPragMinim, StarePragMinim } from './pragMinim'
export {
  getGrupeSubMinim,
  lunaScurta,
  serieSubMinim,
  motivSuspendareSubMinim,
  LUNI_PANA_LA_PROPUNERE,
} from './pragMinim'
