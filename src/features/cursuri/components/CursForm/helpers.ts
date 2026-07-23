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
  rezervari_online: boolean
  program_metodologic: string
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
    rezervari_online: curs?.rezervari_online ?? false,
    program_metodologic: curs?.program_metodologic ?? '',
  }
}

export const toNum = (s: string) => (s.trim() ? Number(s) : null)

// Normalizează o oră liberă la "HH:MM" (zero-padded). Acceptă "19", "9:5",
// "17:30", "17:30:00". Gol → null (fără oră). Invalid → { ok: false }.
// Gard la sursă: o oră fără minute („19") strica proiecția în calendar.
export type OraParse = { ok: true; value: string | null } | { ok: false }
export function parseOra(raw: string): OraParse {
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  const m = /^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/.exec(t)
  if (!m) return { ok: false }
  const h = Number(m[1])
  const min = m[2] != null ? Number(m[2]) : 0
  if (h > 23 || min > 59) return { ok: false }
  return {
    ok: true,
    value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
  }
}

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void
