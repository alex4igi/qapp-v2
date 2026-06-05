export type Step = 1 | 2 | 3 | 4

export type SursaCurs = {
  id: string
  numele: string
  varsta: string | null
  stil: string | null
  facultativ: boolean
  pret_lunar: number | null
  pret_anual: number | null
  pret_sedinta: number | null
  pret_lunar_promo: number | null
  capacitate_maxima: number | null
}

export type CursRow = {
  sursa: SursaCurs
  selected: boolean
  numele: string
  pret_lunar: string
  capacitate_maxima: string
}

export type VacantaRow = {
  key: string
  nume: string
  data_incepere: string
  data_final: string
}

export const newVacantaRow = (): VacantaRow => ({
  key: crypto.randomUUID(),
  nume: '',
  data_incepere: '',
  data_final: '',
})

export type Tip = 'principal' | 'extra'

// Validare Pas 1 — detalii sezon nou
export function validatePas1(params: {
  sursaId: string
  nume: string
  dataIncepere: string
  dataFinal: string
}): string | null {
  if (!params.sursaId) return 'Alege sezonul sursă.'
  if (!params.nume.trim()) return 'Numele este obligatoriu.'
  if (!params.dataIncepere || !params.dataFinal)
    return 'Datele de început și final sunt obligatorii.'
  if (params.dataFinal < params.dataIncepere)
    return 'data_final nu poate fi înainte de data_incepere.'
  return null
}

// Validare Pas 3 — vacanțe în interiorul sezonului
export function validatePas3(params: {
  vacante: VacantaRow[]
  dataIncepere: string
  dataFinal: string
}): string | null {
  for (const v of params.vacante) {
    const hasAny = v.nume.trim() || v.data_incepere || v.data_final
    if (!hasAny) continue
    if (!v.nume.trim() || !v.data_incepere || !v.data_final)
      return 'Fiecare vacanță trebuie să aibă nume + dată început + dată final.'
    if (v.data_final < v.data_incepere)
      return `Vacanță „${v.nume}": data_final înainte de data_incepere.`
    if (v.data_incepere < params.dataIncepere || v.data_final > params.dataFinal)
      return `Vacanță „${v.nume}": intervalul trebuie să fie în interiorul sezonului.`
  }
  return null
}
