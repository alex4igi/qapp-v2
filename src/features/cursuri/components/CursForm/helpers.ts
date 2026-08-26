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

// Payload-ul trimis la salvare. Construit AICI, nu în corpul mutației, pentru
// că checklistul live din formular îl evaluează pe același obiect — altfel
// „ce se salvează" și „ce se verifică" pot să se despartă în timp.
export type CursPayload = {
  numele: string
  stil: string | null
  nivelul: Curs['nivelul']
  varsta: Curs['varsta']
  teacher: string | null
  locatie: string | null
  sala: string | null
  sezon: string | null
  zile: Curs['zile']
  ora: string | null
  ore_pe_zi: Curs['ore_pe_zi']
  link_whatsapp: string | null
  durata_cursului: number | null
  capacitate_maxima: number | null
  pret_anual: number | null
  pret_lunar: number | null
  pret_sedinta: number | null
  pret_sedinta_reziliere: number | null
  pret_lunar_promo: number | null
  facultativ: boolean
  one_time: boolean
  suspendat: boolean
  rezervari_online: boolean
  program_metodologic: string | null
}

// Orele sunt normalizate la "HH:MM"; o valoare invalidă e blocată în handleSubmit
// înainte să ajungă aici, deci `raw` e fie gol, fie parsabil.
const normOra = (raw: string): string | null => {
  const p = parseOra(raw)
  return p.ok ? p.value : raw.trim() || null
}

export function buildCursPayload(form: FormState): CursPayload {
  const isTrupa = form.tip === 'recurent-trupa'
  const facultativ = form.tip === 'facultativ'

  // Orar diferit pe zile: păstrează doar zilele selectate cu oră completată.
  // `ora` rămâne populat (cu prima zi) ca fallback pentru căile vechi.
  const orePeZi = form.orarDiferit
    ? Object.fromEntries(
        form.zile
          .filter((z) => form.orePeZi[z]?.trim())
          .map((z) => [z, normOra(form.orePeZi[z])]),
      )
    : null
  const orePeZiFinal = orePeZi && Object.keys(orePeZi).length ? orePeZi : null
  const oraFinal = orePeZiFinal
    ? (Object.values(orePeZiFinal)[0] as string | null)
    : normOra(form.ora)

  return {
    numele: form.numele.trim(),
    stil: form.stil.trim() || null,
    nivelul: (isTrupa ? 'Trupa' : form.nivelul || null) as Curs['nivelul'],
    varsta: (form.varsta || null) as Curs['varsta'],
    teacher: form.teacher || null,
    locatie: form.locatie || null,
    sala: form.sala || null,
    sezon: form.sezon || null,
    zile: (form.zile.length ? form.zile : null) as Curs['zile'],
    ora: oraFinal,
    ore_pe_zi: orePeZiFinal as Curs['ore_pe_zi'],
    link_whatsapp: form.link_whatsapp.trim() || null,
    durata_cursului: toNum(form.durata_cursului),
    capacitate_maxima: toNum(form.capacitate_maxima),
    pret_anual: toNum(form.pret_anual),
    pret_lunar: toNum(form.pret_lunar),
    pret_sedinta: toNum(form.pret_sedinta),
    pret_sedinta_reziliere: facultativ ? null : toNum(form.pret_sedinta_reziliere),
    pret_lunar_promo: facultativ ? null : toNum(form.pret_lunar_promo),
    facultativ,
    one_time: form.one_time,
    suspendat: form.suspendat,
    // Membrii se pot programa online DOAR la facultative cu bifa activă.
    rezervari_online: facultativ ? form.rezervari_online : false,
    program_metodologic: form.program_metodologic || null,
  }
}
