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
  prorata:
    | { sursaPret: 'sedinta'; sedinte: number; suma: number }
    | { sursaPret: 'anual' }
    | { sursaPret: 'lipsa' }
    | null
}

// Pentru recurent + per lună: câte înrolări lunare se vor crea (până la 30 iun)
// și — la grupă cu semnare la mijlocul lunii — suma prorata pentru prima lună.
export function derivePreviewRecurent(params: {
  dataIncepere: string
  isFacultativ: boolean
  isTrupa: boolean
  tipPlata: string
  cursSelectat: Curs | null
  // Data de start a sezonului ales. Prima lună a sezonului = rată întreagă;
  // prorata se aplică doar la înscriere TÂRZIE (lună ulterioară începutului).
  sezonStart?: string | null
  // Finalul sezonului ales — dă numărul real de rate. Fără el cădem pe convenția
  // istorică „sezonul se termină în iunie".
  sezonEnd?: string | null
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

  let prorata: PrevizualizareRecurent['prorata'] = null
  const seasonFirstMonth = params.sezonStart
    ? params.sezonStart.slice(0, 7) + '-01'
    : null
  const primaLunaESezonStart =
    seasonFirstMonth != null &&
    params.dataIncepere.slice(0, 7) + '-01' === seasonFirstMonth
  const semnareNuELaZi1 = params.dataIncepere.slice(8, 10) !== '01'
  if (
    !params.isTrupa &&
    !primaLunaESezonStart &&
    semnareNuELaZi1 &&
    params.cursSelectat
  ) {
    const fin = endOfMonth(params.dataIncepere.slice(0, 7) + '-01')
    const sedinte = countSessionsBetween(
      params.dataIncepere,
      fin,
      params.cursSelectat.zile,
    )
    if (params.cursSelectat.pret_sedinta != null) {
      prorata = {
        sedinte,
        suma: sedinte * params.cursSelectat.pret_sedinta,
        sursaPret: 'sedinta',
      }
    } else if (params.cursSelectat.pret_anual != null) {
      prorata = { sursaPret: 'anual' }
    } else {
      prorata = { sursaPret: 'lipsa' }
    }
  }
  return { months, prorata }
}
