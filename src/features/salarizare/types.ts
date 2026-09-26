/** Forma întoarsă de `get_salarizare_luna`. */

export type StareComponenta = 'confirmat' | 'corectat' | 'provizoriu' | 'blocat' | 'de_confirmat'

export type Componenta = {
  cheie: string
  eticheta: string
  suma: number
  stare: StareComponenta
  provizoriu?: boolean
  final_la?: string | null
  blocant?: string | null
  confirmat_la?: string
  id?: string
}

export type InstructorLuna = {
  teacher_id: string
  user_id: string | null
  nume: string
  rang: string | null
  nr_grupe: number
  totaluri: {
    baza: number
    retentie: number
    ocupare: number
    prezente_vara: number
    beneficii: number
    info_deplasari: number
  } | null
  total: number
  blocante: string[]
  provizoriu: boolean
  final_la: string | null
  confirmat: boolean
  data_plata: string | null
}

export type ManagerLocatie = {
  locatie_id: string
  locatie_nume: string
  incasare: {
    scadent: number
    platit: number
    nr_rate: number
    rata: number | null
    treapta: 'peste' | 'standard' | 'sub' | 'insuficient' | 'na'
    procent: number
    incasari_luna: number
    bonus: number
    provizoriu: boolean
    final_la: string
  }
  ocupare: {
    locuri: number
    capacitate: number
    grupe_active: number
    grupe_in_pool: number
    procent: number | null
    treapta_masurata: string
    treapta: string
    mod: 'masurat' | 'standard_fix' | 'standard_podea'
    lei_pe_loc: number
    bonus: number
    grupe_lipsa_din_pool: string[]
  }
}

export type ManagerLuna = {
  user_id: string
  titular_nume: string
  perioada: 'sezon' | 'vara'
  baza: { nr_locatii: number; suma: number }
  locatii: ManagerLocatie[]
  componente: Componenta[]
  total: number
  blocante: string[]
  avertismente: string[]
  confirmat_tot: boolean
  confirmat_partial: boolean
}

export type LinieKpiRezumat = {
  cheie: string
  denumire: string
  valoare: number | null
  unitate: string | null
  banda: 'sub' | 'standard' | 'peste' | 'na'
  motiv: string | null
  suma: number
  provizoriu?: boolean
  aplicabil: boolean
}

export type ReceptieLuna = {
  user_id: string
  titular_nume: string
  perioada: 'sezon' | 'vara'
  norma: number
  kpi: {
    grila_id: string
    stare_raport: 'nedeschis' | 'draft' | 'inchis'
    sursa: 'live' | 'inghetat'
    bonus_grila: number
    linii: LinieKpiRezumat[]
    avertismente: string[]
  } | null
  beneficii: { cheie: string; eticheta: string; suma: number }[]
  bonusuri_ocazionale: boolean
  componente: Componenta[]
  total: number
  blocante: string[]
  avertismente: string[]
  confirmat_tot: boolean
  confirmat_partial: boolean
}

export type SalarizareLuna = {
  anul: number
  luna: number
  instructori: InstructorLuna[]
  manageri: ManagerLuna[]
  receptie: ReceptieLuna[]
  total_instructori: number
  total_manageri: number
  total_receptie: number
  beneficii: number
}

export type RezultatConfirmare = {
  confirmate: { eticheta: string; suma: number }[]
  ramase: { eticheta: string; final_la: string | null }[]
  blocate: { eticheta: string; motiv: string }[]
  deja_confirmate: string[]
}
