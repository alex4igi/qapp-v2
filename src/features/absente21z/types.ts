export type CanalContact = 'telefon' | 'sms' | 'email' | 'dm'
export type RezultatContact = 'reusit' | 'follow_up' | 'pierdut' | 'nu_raspunde'

export type StareAbsenta =
  | 'de_contactat'
  | 'reincercare'
  | 'fara_raspuns'
  | 'de_confirmat'
  | 'revine'
  | 'amanat'
  | 'renunta'
  | 'a_revenit'
  | 'reziliat'
  | 'pastrat'
  | 'reziliat_separat'

export type CazAbsenta = {
  id: string
  client_id: string
  client_nume: string
  telefon: string | null
  curs_id: string
  curs_nume: string | null
  locatie_nume: string | null
  data_intrare: string
  ultima_prezenta: string | null
  zile_tacere: number
  /** Ore lucrătoare (fără sâmbătă și duminică) de la intrare până la primul contact / acum. */
  ore_de_la_intrare: number
  contactat_la: string | null
  motiv: string | null
  pas_urmator: string | null
  reactivat: boolean | null
  reactivat_la: string | null
  stare: StareAbsenta
  incercari: number
  urmatoarea_incercare: string | null
  de_sunat: boolean
  sms_fara_raspuns_la: string | null
  sms_fara_raspuns_eroare: string | null
  exclus_k3: boolean
  reziliere_propusa_la: string | null
  reziliere_decisa_la: string | null
  reziliere_nota: string | null
  luni_de_reziliat: number | null
}

export type MotivAbandon = { id: string; eticheta: string }

/** Ceasul de 48 h lucrătoare, doar pentru primul apel: verde sub 24, galben 24–48, roșu peste. */
export type UrgentaCaz = 'verde' | 'galben' | 'rosu' | 'contactat'

export function urgenta(caz: CazAbsenta): UrgentaCaz {
  if (caz.contactat_la) return 'contactat'
  if (caz.ore_de_la_intrare >= 48) return 'rosu'
  if (caz.ore_de_la_intrare >= 24) return 'galben'
  return 'verde'
}
