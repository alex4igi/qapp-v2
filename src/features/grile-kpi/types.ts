export type TipValoare = 'procent' | 'numar' | 'bifa'
export type TipPrag = 'procent' | 'numar' | 'afirmativ'
export type ModCalcul = 'fix' | 'comision'

/** Descriptorul unui număr propriu indicatorului, randat generic în editor. */
export type ParametruSchema = {
  cheie: string
  eticheta: string
  tip: 'numar' | 'procent' | 'bifa'
  min?: number
  max?: number
  default?: number
  unitate?: string
}

export type KpiDefinitie = {
  id: string
  cheie: string
  denumire: string
  descriere: string | null
  sursa: 'auto' | 'manual'
  tip_valoare: TipValoare
  unitate: string | null
  parametri_schema: ParametruSchema[]
  activ: boolean
  ordine: number
}

/** O linie de grilă = un bonus, cu tot ce-l definește. */
export type LinieGrila = {
  id?: string
  kpi_id: string
  pondere: number
  tip_prag: TipPrag
  prag_standard: number | null
  prag_peste: number | null
  conditie_sub: string | null
  conditie_standard: string | null
  conditie_peste: string | null
  suma_standard: number | null
  suma_peste: number | null
  mod_calcul: ModCalcul
  comision_procent_standard: number | null
  comision_procent_peste: number | null
  comision_plafon: number | null
  luni_active: number[] | null
  eliminatoriu: boolean
  are_poarta: boolean
  /** Luna în care indicatorul n-are ce măsura plătește standardul, fără redistribuire. */
  na_standard: boolean
  parametri: Record<string, number | boolean | string>
  activ: boolean
  ordine: number
}

export type GrilaSumar = {
  id: string
  titular_nume: string
  tip_titular: 'user' | 'teacher'
  post: string
  perioada: 'sezon' | 'vara'
  locatii: string | null
  valabil_de_la: string
  valabil_pana_la: string | null
  stare: 'ciorna' | 'activa' | 'incheiata'
  pondere_totala: number
  nr_linii: number
  sume_lipsa: number
}

export type Titular = {
  tip: 'user' | 'teacher'
  titular_id: string
  nume_afisat: string
  email: string | null
  rol: string | null
  locatie_id: string | null
  are_grila: boolean
}

export type Sablon = {
  id: string
  nume: string
  post: string
  perioada: 'sezon' | 'vara'
  cota_manager: number
  zile_min_evaluare: number
  stare: 'ciorna' | 'activ' | 'arhivat'
  nota: string | null
}

export const LUNI_SCURT = [
  'ian', 'feb', 'mar', 'apr', 'mai', 'iun',
  'iul', 'aug', 'sep', 'oct', 'nov', 'dec',
]
