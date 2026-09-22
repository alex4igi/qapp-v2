import type { Curs } from '@/types/db'
import { countSessionsBetween, endOfMonth } from '../../api'
import type { TipInrolare } from '../../api'

export function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export function deriveTip(curs: Curs | null): TipInrolare | null {
  if (!curs) return null
  if (curs.facultativ) return 'facultativ'
  return curs.nivelul === 'Trupa' ? 'recurent-trupa' : 'recurent-grupa'
}

export const TIP_LABEL: Record<TipInrolare, string> = {
  'recurent-grupa': 'Grupă recurentă',
  'recurent-trupa': 'Trupă',
  facultativ: 'Facultativ',
}

// Ordinea de sortare în dropdown: grupele recurente primele, apoi trupe,
// apoi facultative.
export const TIP_ORDER: Record<TipInrolare, number> = {
  'recurent-grupa': 0,
  'recurent-trupa': 1,
  facultativ: 2,
}

export type PrevizualizareRecurent = {
  months: number
  // Nicio ședință rămasă în luna semnării ⇒ prima rată e luna următoare.
  primaLunaSarita: boolean
  prorata:
    | {
        sursaPret: 'proportional'
        sedinte: number
        sedinteLuna: number
        suma: number
      }
    | {
        sursaPret: 'sedinta'
        sedinte: number
        sedinteLuna: number
        suma: number
        plafonat: boolean
      }
    | { sursaPret: 'anual' }
    | { sursaPret: 'lipsa' }
    | null
}

// Pentru recurent + per lună: câte înrolări lunare se vor crea (până la 30 iun)
// și — la grupă care pierde ședințe din prima lună — suma prorata.
export function derivePreviewRecurent(params: {
  dataIncepere: string
  isFacultativ: boolean
  isTrupa: boolean
  tipPlata: string
  cursSelectat: Curs | null
  // Data de start a sezonului ales: în luna de start, ședințele se numără de la
  // ea, nu de la 1 — cine pornește cu sezonul plătește rata întreagă.
  sezonStart?: string | null
  // Finalul sezonului ales — dă numărul real de rate. Fără el cădem pe convenția
  // istorică „sezonul se termină în iunie".
  sezonEnd?: string | null
  // Reînscrierea schimbă rata lunară (pret_lunar_promo) — deci și plafonul
  // peste care prorata nu poate trece.
  esteReinscriere?: boolean
}): PrevizualizareRecurent | null {
  if (params.isFacultativ || params.tipPlata !== 'Per luna') return null
  const d = new Date(params.dataIncepere)
  if (isNaN(d.getTime())) return null
  const end = params.sezonEnd
    ? new Date(params.sezonEnd)
    : (() => {
        const y = d.getFullYear()
        return new Date(d.getMonth() < 6 ? y : y + 1, 5, 30)
      })()
  if (isNaN(end.getTime())) return null
  const months =
    (end.getFullYear() - d.getFullYear()) * 12 +
    (end.getMonth() - d.getMonth()) +
    1
  if (months <= 0) return null

  // Oglindește `buildRecurentPerLuna`: prorata doar când se pierd efectiv
  // ședințe din prima lună, nu doar pentru că ziua semnării nu e 1.
  const luna = params.dataIncepere.slice(0, 7) + '-01'
  const esteLunaDeStart =
    params.sezonStart != null &&
    luna === params.sezonStart.slice(0, 7) + '-01'
  const inceputLuna =
    esteLunaDeStart && params.sezonStart ? params.sezonStart : luna
  const fin = endOfMonth(luna)
  const zile = params.cursSelectat?.zile ?? null
  const sedinte = countSessionsBetween(params.dataIncepere, fin, zile)
  const sedinteLuna = countSessionsBetween(inceputLuna, fin, zile)
  const curs = params.isTrupa ? null : params.cursSelectat

  if (curs && sedinte === 0 && sedinteLuna > 0) {
    return months > 1
      ? { months: months - 1, primaLunaSarita: true, prorata: null }
      : null
  }

  let prorata: PrevizualizareRecurent['prorata'] = null
  if (curs && sedinte < sedinteLuna) {
    const rata = params.esteReinscriere
      ? curs.pret_lunar_promo
      : curs.pret_anual != null
        ? Math.round(curs.pret_anual / 10)
        : null
    if (esteLunaDeStart && rata != null) {
      prorata = {
        sedinte,
        sedinteLuna,
        suma: Math.round((rata * sedinte) / sedinteLuna),
        sursaPret: 'proportional',
      }
    } else if (curs.pret_sedinta != null) {
      const brut = Math.round(sedinte * curs.pret_sedinta)
      prorata = {
        sedinte,
        sedinteLuna,
        suma: rata != null ? Math.min(brut, rata) : brut,
        plafonat: rata != null && brut > rata,
        sursaPret: 'sedinta',
      }
    } else if (curs.pret_anual != null) {
      prorata = { sursaPret: 'anual' }
    } else {
      prorata = { sursaPret: 'lipsa' }
    }
  }
  return { months, primaLunaSarita: false, prorata }
}
