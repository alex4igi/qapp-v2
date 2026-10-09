import { supabase } from '@/lib/supabase'
import type { SalariuTeacher } from '@/types/db'

/**
 * Salariul instructorului pe grila 2026-2027 — forma întoarsă de
 * `calculeaza_salariu_teacher` (versiune 2). O citesc profilul instructorului,
 * „Salariul meu" și pagina de salarizare; de aceea stă în lib, nu într-un modul.
 */

export type BandaSalariu = 'sub' | 'standard' | 'peste' | 'prima_luna' | 'exclus'

export type NivelPlata = 'incepator' | 'intermediar' | 'trupa' | 'trupa_ca_intermediar'

export type RetentieGrupa = {
  banda: BandaSalariu
  /** La facultative (`ponderat`): locuri echivalente din luna trecută, nu oameni. */
  n_luna_trecuta: number
  pastrati: number
  procent: number | null
  suma: number
  /** Grupă facultativă: omul cântărește cât loc a ocupat luna trecută (27 sept. 2026). */
  ponderat?: boolean
  oameni_luna_trecuta?: number | null
  oameni_pastrati?: number | null
  /** Banda `exclus`: retenția scoasă din salariu pe luna asta (`salarizare_excluderi`). */
  motiv?: string | null
}

export type OcupareGrupa = {
  banda: Exclude<BandaSalariu, 'prima_luna' | 'exclus'>
  banda_masurata: Exclude<BandaSalariu, 'prima_luna' | 'exclus'>
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

/**
 * Locul echivalent al unei grupe facultative: abonatul = 1, cine plătește pe ședință
 * = ședințele lui / ședințele lunii (cel mult 1). `n` = abonati + din_sedinte. Lipsă
 * la grupele recurente și în calculele înghețate înainte de 26 sept. 2026.
 */
export type LocEchivalent = {
  n: number
  abonati?: number
  din_sedinte?: number
  oameni_pe_sedinta?: number
  sedinte_platite?: number
  sedinte_luna?: number | null
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
  loc_echivalent?: LocEchivalent | null
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

/** Grupă scoasă din salarizare pe luna asta: nici bază, nici bonusuri (`salarizare_excluderi`). */
export type GrupaExclusa = { curs_id: string; curs_nume: string; motiv: string }

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
  /** Lipsă în calculele înghețate înainte de 9 oct. 2026. */
  grupe_excluse?: GrupaExclusa[]
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

/**
 * Cursanții unei grupe recurente pe lună: numărați la salariu și pe prorata, nenumărați
 * (`detaliu_cursanti_salariu`, doar admin; regula din 9 oct. 2026).
 */
export type DetaliuCursantiGrupa = {
  numarati: number
  prorata: number
  suma_numarati: number
  suma_prorata: number
  prezente_prorata: number
  lista_prorata: { client_id: string; nume: string; suma: number; prezente: number }[]
}

export async function getDetaliuCursanti(
  cursuri: string[],
  anul: number,
  luna: number,
): Promise<Record<string, DetaliuCursantiGrupa>> {
  const { data, error } = await supabase.rpc('detaliu_cursanti_salariu', {
    p_cursuri: cursuri,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return (data ?? {}) as unknown as Record<string, DetaliuCursantiGrupa>
}

/** Instructorul din afara grilei nu are simulare și nici confirmare din grilă. */
export async function getInAfaraGrilei(teacherId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('teacheri')
    .select('in_afara_grilei')
    .eq('id', teacherId)
    .single()
  if (error) throw error
  return data.in_afara_grilei
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
  exclus: 'exclusă',
}
