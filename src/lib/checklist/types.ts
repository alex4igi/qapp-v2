import type { BadgeTone } from '@/components/ui'

export type Severitate = 'esential' | 'recomandat'

/**
 * Un item de checklist e o REGULĂ DERIVATĂ, nu o bifă stocată: `completat` se
 * recalculează din entitate la fiecare render. Consecința e că nu există bifă
 * care să mintă și că regula se aplică retroactiv pe rândurile deja existente.
 */
export type ChecklistItem<T> = {
  id: string
  eticheta: string
  severitate: Severitate
  /** De ce contează — consecința concretă a lipsei, arătată sub item. */
  motiv?: string
  /** Secțiunea de formular unde se completează (pentru deep-link din card). */
  sectiune?: string
  /** Absent ⇒ itemul se aplică mereu. */
  seAplica?: (e: T) => boolean
  completat: (e: T) => boolean
}

export type ChecklistSpec<T> = {
  entitate: string
  items: ChecklistItem<T>[]
}

/** Rezultatul evaluării — date pure de afișare, fără funcții. */
export type StareItem = {
  id: string
  eticheta: string
  severitate: Severitate
  motiv?: string
  sectiune?: string
  completat: boolean
}

export type Rezultat = {
  /** Doar itemii aplicabili entității (după `seAplica`). */
  total: number
  completate: number
  procent: number
  completa: boolean
  aplicabile: StareItem[]
  lipsaEsentiale: StareItem[]
  lipsaRecomandate: StareItem[]
  tone: BadgeTone
}
