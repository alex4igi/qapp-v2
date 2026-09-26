import { supabase } from '@/lib/supabase'
import type { SalariuTeacher } from '@/types/db'

/**
 * Salariul instructorului pe grila 2026-2027 — forma întoarsă de
 * `calculeaza_salariu_teacher` (versiune 2). O citesc profilul instructorului,
 * „Salariul meu" și pagina de salarizare; de aceea stă în lib, nu într-un modul.
 */

export type BandaSalariu = 'sub' | 'standard' | 'peste' | 'prima_luna'

export type NivelPlata = 'incepator' | 'intermediar' | 'trupa' | 'trupa_ca_intermediar'

export type RetentieGrupa = {
  banda: BandaSalariu
  n_luna_trecuta: number
  pastrati: number
  procent: number | null
  suma: number
}

export type OcupareGrupa = {
  banda: Exclude<BandaSalariu, 'prima_luna'>
  banda_masurata: Exclude<BandaSalariu, 'prima_luna'>
  mod: 'masurat' | 'standard_fix' | 'standard_podea'
  cursanti: number
  capacitate: number
  procent: number
  prag_standard: number
  prag_peste: number
  lei_standard: number
  lei_peste: number
  suma: number
}

export type MaturitateGrupa = {
  matur: boolean
  serie_max: number
  necesar: number
  minim: number
  fereastra_de_la: string
}

export type SalariuGrupaV2 = {
  curs_id: string
  curs_nume: string
  nivel_curs: string | null
  nivel_plata: NivelPlata | null
  sedinte_per_sapt: number
  factor: number
  cursanti: number
  capacitate?: number | null
  baza: number
  retentie: RetentieGrupa | null
  ocupare: OcupareGrupa | null
  maturitate?: MaturitateGrupa | null
  info?: { buget_deplasari_sezon: number } | null
  blocant: string | null
  suma: number
}

export type LiniePersoana = {
  cheie: string
  eticheta: string
  suma: number
  tip: 'beneficiu' | 'bani'
  nota?: string
}

export type PrezenteVara = { curs_id: string; curs_nume: string; nr: number; suma: number }

export type SalariuTeacherCalc = {
  versiune: 2
  teacher_id: string
  anul: number
  luna: number
  sezon_id: string | null
  rang: string | null
  perioada: 'sezon' | 'vara'
  grupe: SalariuGrupaV2[]
  prezente_vara: PrezenteVara[]
  linii_persoana: LiniePersoana[]
  totaluri: {
    baza: number
    retentie: number
    ocupare: number
    prezente_vara: number
    beneficii: number
    info_deplasari: number
  }
  total: number
  total_prezente: number
  blocante: string[]
  provizoriu: boolean
  final_la: string
}

export async function previewSalariuTeacher(
  teacherId: string,
  anul: number,
  luna: number,
): Promise<SalariuTeacherCalc> {
  const { data, error } = await supabase.rpc('calculeaza_salariu_teacher', {
    p_teacher: teacherId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as SalariuTeacherCalc
}

export async function listSalariiTeacher(teacherId: string): Promise<SalariuTeacher[]> {
  const { data, error } = await supabase
    .from('salarii_teacher')
    .select('*')
    .eq('teacher', teacherId)
    .order('anul', { ascending: false })
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function confirmaSalariuTeacher(
  teacherId: string,
  anul: number,
  luna: number,
): Promise<SalariuTeacher> {
  const { data, error } = await supabase.rpc('confirma_salariu_teacher', {
    p_teacher: teacherId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as SalariuTeacher
}

export async function corecteazaSalariuTeacher(
  teacherId: string,
  anul: number,
  luna: number,
  motiv: string,
): Promise<SalariuTeacher> {
  const { data, error } = await supabase.rpc('corecteaza_salariu_teacher', {
    p_teacher: teacherId,
    p_anul: anul,
    p_luna: luna,
    p_motiv: motiv,
  })
  if (error) throw error
  return data as unknown as SalariuTeacher
}

/** Calculul înghețat al unei luni confirmate (`salarii_teacher.breakdown`). */
export function calculDinSnapshot(row: SalariuTeacher): SalariuTeacherCalc | null {
  const b = row.breakdown as unknown
  if (!b || Array.isArray(b) || typeof b !== 'object') return null
  return b as SalariuTeacherCalc
}

export const NIVEL_PLATA_ETICHETA: Record<NivelPlata, string> = {
  incepator: 'începător',
  intermediar: 'intermediar',
  trupa: 'trupă',
  trupa_ca_intermediar: 'trupă, plătită ca intermediar',
}

export const BANDA_ETICHETA: Record<BandaSalariu, string> = {
  sub: 'sub standard',
  standard: 'standard',
  peste: 'peste standard',
  prima_luna: 'prima lună · standard',
}
