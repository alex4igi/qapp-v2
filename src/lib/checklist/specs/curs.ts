import type { ChecklistSpec } from '../types'
import type { Curs } from '@/types/db'

/** Secțiunea din CursForm unde se completează câmpul (deep-link din card). */
export type SectiuneCurs = 'detalii' | 'program' | 'tarif'

/**
 * Subsetul de câmpuri de care depinde checklistul. E satisfăcut structural ATÂT
 * de un rând `cursuri` din DB, CÂT ȘI de draftul construit din formular
 * (`buildCursPayload`) — de aceea aceeași regulă merge în toate cele 4 locuri
 * unde e afișat checklistul, fără query-uri suplimentare.
 */
export type CursCheckInput = {
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
  program_metodologic: string | null
}

const completat = (v: string | null | undefined) => Boolean(v && v.trim())
const pozitiv = (n: number | null | undefined) => n != null && n > 0
const recurent = (c: CursCheckInput) => !c.facultativ

// Ora poate sta fie în `ora` (același orar în toate zilele), fie în `ore_pe_zi`
// (orar diferit pe zile). Oricare dintre ele o consideră completată.
const areOra = (c: CursCheckInput) => {
  if (completat(c.ora)) return true
  const m = c.ore_pe_zi
  return Boolean(
    m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).length > 0,
  )
}

/** Coloanele din `cursuri` pe care le cere checklistul — un singur adevăr
 *  pentru toți apelanții care aduc rânduri special pentru evaluare. */
export const CURS_CHECKLIST_COLS = [
  'id', 'numele', 'stil', 'nivelul', 'varsta', 'teacher', 'locatie', 'sala',
  'sezon', 'zile', 'ora', 'ore_pe_zi', 'link_whatsapp', 'durata_cursului',
  'capacitate_maxima', 'pret_anual', 'pret_lunar', 'pret_sedinta',
  'pret_sedinta_reziliere', 'pret_lunar_promo', 'facultativ',
  'program_metodologic',
].join(',')

export const CURS_CHECKLIST: ChecklistSpec<CursCheckInput> = {
  entitate: 'curs',
  items: [
    {
      id: 'nume',
      eticheta: 'Nume curs',
      severitate: 'esential',
      sectiune: 'detalii',
      completat: (c) => completat(c.numele),
    },
    {
      id: 'sezon',
      eticheta: 'Sezon',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Fără sezon, grupa nu apare în listele și statisticile sezonului.',
      completat: (c) => completat(c.sezon),
    },
    {
      id: 'locatie',
      eticheta: 'Locație',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Fără locație, grupa nu apare la recepția care lucrează acolo.',
      completat: (c) => completat(c.locatie),
    },
    {
      id: 'sala',
      eticheta: 'Sală',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Sala e cea care rezervă intervalul — fără ea apar suprapuneri.',
      completat: (c) => completat(c.sala),
    },
    {
      id: 'teacher',
      eticheta: 'Teacher titular',
      severitate: 'esential',
      sectiune: 'detalii',
      motiv: 'Titularul e baza salarizării și a accesului la grupă.',
      completat: (c) => completat(c.teacher),
    },
    {
      id: 'zile',
      eticheta: 'Zile de curs',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Fără zile, grupa nu apare în prezențe și în calendar.',
      completat: (c) => Boolean(c.zile?.length),
    },
    {
      id: 'ora',
      eticheta: 'Ora',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Fără oră, grupa nu se poziționează în calendar.',
      completat: areOra,
    },
    {
      id: 'nivel',
      eticheta: 'Nivel de dificultate',
      severitate: 'esential',
      sectiune: 'detalii',
      motiv: 'Nivelul orientează înscrierea corectă a cursanților noi.',
      completat: (c) => c.nivelul != null,
    },
    {
      id: 'varsta',
      eticheta: 'Grupă de vârstă',
      severitate: 'esential',
      sectiune: 'detalii',
      motiv: 'Fără grupă de vârstă, lead-urile nu se potrivesc automat pe curs.',
      completat: (c) => c.varsta != null,
    },
    {
      id: 'capacitate',
      eticheta: 'Capacitate maximă',
      severitate: 'esential',
      sectiune: 'tarif',
      motiv: 'Fără capacitate, ocuparea grupei nu se poate calcula.',
      completat: (c) => pozitiv(c.capacitate_maxima),
    },
    {
      id: 'durata',
      eticheta: 'Durata ședinței',
      severitate: 'esential',
      sectiune: 'program',
      motiv: 'Durata stabilește cât timp ocupă sala în calendar.',
      completat: (c) => pozitiv(c.durata_cursului),
    },
    {
      id: 'pret_lunar',
      eticheta: 'Preț lunar',
      severitate: 'esential',
      sectiune: 'tarif',
      completat: (c) => pozitiv(c.pret_lunar),
    },
    {
      id: 'pret_sedinta',
      eticheta: 'Preț ședință',
      severitate: 'esential',
      sectiune: 'tarif',
      completat: (c) => pozitiv(c.pret_sedinta),
    },
    {
      id: 'pret_anual',
      eticheta: 'Preț anual',
      severitate: 'esential',
      sectiune: 'tarif',
      seAplica: recurent,
      completat: (c) => pozitiv(c.pret_anual),
    },
    {
      id: 'pret_sedinta_reziliere',
      eticheta: 'Preț ședință (reziliere)',
      severitate: 'esential',
      sectiune: 'tarif',
      seAplica: recurent,
      motiv: 'Se folosește la calculul sumei rămase când un cursant reziliază.',
      completat: (c) => pozitiv(c.pret_sedinta_reziliere),
    },
    {
      id: 'link_whatsapp',
      eticheta: 'Link grup WhatsApp',
      severitate: 'recomandat',
      sectiune: 'program',
      motiv: 'Fără link, butonul „Grup WhatsApp" de pe fișă nu apare.',
      completat: (c) => completat(c.link_whatsapp),
    },
    {
      id: 'stil',
      eticheta: 'Stil de dans',
      severitate: 'recomandat',
      sectiune: 'detalii',
      completat: (c) => completat(c.stil),
    },
    {
      id: 'program_metodologic',
      eticheta: 'Program metodologic',
      severitate: 'recomandat',
      sectiune: 'program',
      seAplica: recurent,
      motiv: 'Fără program legat, tab-ul „Metodologie" al grupei rămâne gol.',
      completat: (c) => completat(c.program_metodologic),
    },
    {
      id: 'pret_lunar_promo',
      eticheta: 'Preț lunar PROMO',
      severitate: 'recomandat',
      sectiune: 'tarif',
      seAplica: recurent,
      motiv: 'Se folosește la campaniile de reînscriere.',
      completat: (c) => pozitiv(c.pret_lunar_promo),
    },
  ],
}
