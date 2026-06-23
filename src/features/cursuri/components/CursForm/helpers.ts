import type { Curs } from '@/types/db'
import { nivelCursOptions } from '@/lib/enums'

export type TipCurs = 'facultativ' | 'recurent' | 'recurent-trupa'

export const tipCursOptions = [
  { value: 'recurent', label: 'Recurent' },
  { value: 'recurent-trupa', label: 'Recurent trupă' },
  { value: 'facultativ', label: 'Facultativ' },
]

// Nivel fără 'Trupa' (Trupa e exprimată prin Tip curs)
export const nivelFaraTrupa = nivelCursOptions.filter((o) => o.value !== 'Trupa')

export function deriveTip(curs?: Curs | null): TipCurs {
  if (!curs) return 'recurent'
  if (curs.facultativ) return 'facultativ'
  return curs.nivelul === 'Trupa' ? 'recurent-trupa' : 'recurent'
}

export type FormState = {
  numele: string
  stil: string
  tip: TipCurs
  nivelul: string
  varsta: string
  teacher: string
  coInstructor: string
  locatie: string
  sala: string
  sezon: string
  zile: string[]
  ora: string
  orarDiferit: boolean
  orePeZi: Record<string, string>
  link_whatsapp: string
  durata_cursului: string
  capacitate_maxima: string
  pret_anual: string
  pret_lunar: string
  pret_sedinta: string
  pret_sedinta_reziliere: string
  pret_lunar_promo: string
  one_time: boolean
  suspendat: boolean
}

const numOrEmpty = (n: number | null | undefined) => (n != null ? String(n) : '')

export function initialState(curs?: Curs | null): FormState {
  const tip = deriveTip(curs)
  return {
    numele: curs?.numele ?? '',
    stil: curs?.stil ?? '',
    tip,
    nivelul: tip === 'recurent-trupa' ? '' : curs?.nivelul ?? '',
    varsta: curs?.varsta ?? '',
    teacher: curs?.teacher ?? '',
    coInstructor: '',
    locatie: curs?.locatie ?? '',
    sala: curs?.sala ?? '',
    sezon: curs?.sezon ?? '',
    zile: curs?.zile ?? [],
    ora: curs?.ora ?? '',
    orarDiferit: !!(
      curs?.ore_pe_zi &&
      typeof curs.ore_pe_zi === 'object' &&
      !Array.isArray(curs.ore_pe_zi)
    ),
    orePeZi:
      curs?.ore_pe_zi && typeof curs.ore_pe_zi === 'object' && !Array.isArray(curs.ore_pe_zi)
        ? (curs.ore_pe_zi as Record<string, string>)
        : {},
    link_whatsapp: curs?.link_whatsapp ?? '',
    durata_cursului: numOrEmpty(curs?.durata_cursului),
    capacitate_maxima: numOrEmpty(curs?.capacitate_maxima),
    pret_anual: numOrEmpty(curs?.pret_anual),
    pret_lunar: numOrEmpty(curs?.pret_lunar),
    pret_sedinta: numOrEmpty(curs?.pret_sedinta),
    pret_sedinta_reziliere: numOrEmpty(curs?.pret_sedinta_reziliere),
    pret_lunar_promo: numOrEmpty(curs?.pret_lunar_promo),
    one_time: curs?.one_time ?? false,
    suspendat: curs?.suspendat ?? false,
  }
}

export const toNum = (s: string) => (s.trim() ? Number(s) : null)

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void
