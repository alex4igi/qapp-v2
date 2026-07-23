import type { Tables } from '@/types/db'

export type Program = Tables<'programe_metodologice'>
export type ProgramModul = Tables<'program_module'>
export type ProgramLectie = Tables<'program_lectii'>
export type SezonCalendarRand = Tables<'sezon_calendar'>
export type LectieOverride = Tables<'curs_lectii_override'>
export type JurnalRand = Tables<'program_jurnal'>

export type TipLectie = 'lectie' | 'spectacol' | 'concurs'
export type TipCalendar = 'modul' | 'vacanta'
export type StatusJurnal = 'conform' | 'diferit'

// Provenance păstrată la import (jsonb) — ce grupe din xlsx au produs programul.
export type SursaProgram = {
  fisier: string
  sheet: string
  grupa: string
  zile: string
}

// Programul complet: modulele sezonului împletite cu vacanțele, fiecare modul cu
// lecțiile lui. Lecțiile poartă deja adaptarea grupei, dacă e cerută pentru un curs.
export type LectieAfisata = ProgramLectie & {
  titluAfisat: string
  noteAfisate: string | null
  adaptat: boolean
  jurnal: StatusJurnal | null
}

export type ModulAfisat = {
  modul: ProgramModul
  calendar: SezonCalendarRand | null
  lectii: LectieAfisata[]
}

export type ProgramDetaliat = {
  program: Program
  module: ModulAfisat[]
  vacante: SezonCalendarRand[]
  totalSedinte: number
}

// Rând din get_program_progres_admin: un program × un curs asociat (curs null =
// program fără grupe).
export type ProgresAdmin = {
  program_id: string
  program_nume: string
  sezon_eticheta: string
  total_sedinte: number
  curs_id: string | null
  curs_nume: string | null
  locatie_id: string | null
  sedinte_tinute: number | null
  conform_count: number | null
  diferit_count: number | null
}

export type ProgresTeacher = {
  curs_id: string
  curs_nume: string
  program_id: string
  program_nume: string
  total_sedinte: number
  nr_sedinta_curenta: number | null
  urmatoarea_lectie: string | null
  modul_numar: number | null
  modul_tema: string | null
  conform_count: number
  diferit_count: number
}

export type LectieAzi = {
  program_id: string
  program_nume: string
  nr_sedinta: number
  total_sedinte: number
  depasit: boolean
  lectie_id: string
  titlu: string
  note: string | null
  tip: TipLectie
  adaptat: boolean
  modul_numar: number
  modul_tema: string | null
  jurnal_status: StatusJurnal | null
  jurnal_nota: string | null
}
