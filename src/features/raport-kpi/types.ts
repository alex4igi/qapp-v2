/** Forma rezultatului întors de `calculeaza_raport_kpi`. */

export type Banda = 'sub' | 'standard' | 'peste' | 'na'

export type LinieRaport = {
  kpi_id: string
  cheie: string
  denumire: string
  sursa: 'auto' | 'manual'
  unitate: string | null
  tip_prag: 'procent' | 'numar' | 'afirmativ'
  pondere: number
  aplicabil: boolean
  valoare: number | null
  bifa: boolean | null
  prag_standard: number | null
  prag_peste: number | null
  banda: Banda
  motiv: string | null
  motiv_text: string | null
  /** Textul treptei atinse — ce fel de muncă descrie banda asta. */
  conditie: string | null
  conditii: { sub: string | null; standard: string | null; peste: string | null }
  are_poarta: boolean
  poarta_ok: boolean | null
  mod_calcul: 'fix' | 'comision'
  comision_procent: number | null
  comision_plafon: number | null
  suma: number
  parametri: Record<string, number | boolean | string>
  detalii: Record<string, unknown> | null
}

export type LinieEliminatorie = {
  kpi_id: string
  cheie: string
  denumire: string
  sursa: 'auto' | 'manual'
  aplicabil: boolean
  indeplinit: boolean | null
  motiv: string | null
  conditie: string | null
  detalii: Record<string, unknown> | null
}

export type RaportKpi = {
  grila: {
    id: string
    titular_nume: string
    post: string
    perioada: 'sezon' | 'vara'
    stare: 'ciorna' | 'activa' | 'incheiata'
    cota_manager: number
    zile_min_evaluare: number
    locatii: string | null
    valabil_de_la: string
  }
  anul: number
  luna: number
  linii: LinieRaport[]
  eliminatorii: LinieEliminatorie[]
  eliminatoriu_picat: boolean
  zile: {
    lucrate: number | null
    baza: number | null
    prag: number
    sub_prag: boolean
    prorata: number
    sugestie: { lucrate: number | null; baza: number | null }
  }
  pondere_totala_configurata: number
  pondere_luna: number
  pondere_evaluata: number
  factor_redistribuire: number
  plafon_ponderat: number
  bonus_brut: number
  bonus_titular: number
  cota_manager: number
  fond_total: number
  blocante: string[]
  avertismente: string[]
  stare_raport: 'nedeschis' | 'draft' | 'inchis'
  raport_id: string | null
}

export type RandLista = {
  grila_id: string
  titular_nume: string
  post: string
  perioada: 'sezon' | 'vara'
  locatii: string | null
  grila_stare: 'ciorna' | 'activa' | 'incheiata'
  raport_id: string | null
  raport_stare: 'nedeschis' | 'draft' | 'inchis'
  bonus_titular: number | null
  fond_total: number | null
  inchis_la: string | null
}

/** Descriptorul unui câmp manual, din `kpi_campuri`. */
export type CampManual = {
  id: string
  kpi_id: string
  cheie: string
  eticheta: string
  tip: 'procent' | 'numar' | 'bifa' | 'text'
  unitate: string | null
  obligatoriu: boolean
  ordine: number
}

export type ValoriManuale = Record<string, Record<string, number | boolean | string | null>>

export const LUNI_LUNG = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

export const ETICHETA_BANDA: Record<Banda, string> = {
  sub: 'sub standard',
  standard: 'standard',
  peste: 'peste standard',
  na: 'nemăsurabil',
}
