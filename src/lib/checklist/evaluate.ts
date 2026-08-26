import type { BadgeTone } from '@/components/ui'
import type { ChecklistSpec, Rezultat, StareItem } from './types'

/**
 * Rulează un spec peste o entitate. Itemii neaplicabili ies complet din calcul
 * (nu contează nici la numitor), ca un curs facultativ să nu apară „incomplet"
 * pentru câmpuri care nu-l privesc.
 */
export function evalueazaChecklist<T>(
  spec: ChecklistSpec<T>,
  entity: T,
): Rezultat {
  const aplicabile: StareItem[] = spec.items
    .filter((it) => (it.seAplica ? it.seAplica(entity) : true))
    .map((it) => ({
      id: it.id,
      eticheta: it.eticheta,
      severitate: it.severitate,
      motiv: it.motiv,
      sectiune: it.sectiune,
      completat: it.completat(entity),
    }))

  const lipsa = aplicabile.filter((s) => !s.completat)
  const lipsaEsentiale = lipsa.filter((s) => s.severitate === 'esential')
  const lipsaRecomandate = lipsa.filter((s) => s.severitate === 'recomandat')
  const completate = aplicabile.length - lipsa.length
  const tone: BadgeTone = lipsaEsentiale.length
    ? 'danger'
    : lipsaRecomandate.length
      ? 'warn'
      : 'success'

  return {
    total: aplicabile.length,
    completate,
    procent: aplicabile.length
      ? Math.round((completate / aplicabile.length) * 100)
      : 100,
    completa: lipsa.length === 0,
    aplicabile,
    lipsaEsentiale,
    lipsaRecomandate,
    tone,
  }
}
