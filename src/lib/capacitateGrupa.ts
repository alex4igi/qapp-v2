import type { SelectOption } from '@/components/ui'

// Mărimea unei grupe e presetată pe 5 trepte (decizie Alex, 12 sept. 2026).
// Nu e cosmetică: e numitorul KPI-ului de ocupare din grila de salarizare, iar
// sumele de bonus sunt scrise în grilă exact pe treptele astea
// (docs/grila-salarizare-instructori.md §2). Cu valori libere — SCM Studio 2
// avea grupe declarate cu 10, 12, 13, 14, 15 ȘI 30 de locuri — aceeași ocupare
// reală ar plăti diferit de la o grupă la alta.
export const CAPACITATI_GRUPA = [10, 15, 20, 25, 30] as const

export const capacitateGrupaOptions: SelectOption[] = CAPACITATI_GRUPA.map((c) => ({
  value: String(c),
  label: String(c),
}))

// Un curs de dinaintea standardizării poate avea încă o capacitate din afara
// treptelor. O păstrăm ca opțiune marcată, ca să nu se rescrie tăcut când se
// deschide formularul pentru cu totul alt câmp.
export function capacitateGrupaOptionsCu(valoare: string): SelectOption[] {
  const v = valoare.trim()
  if (!v || CAPACITATI_GRUPA.some((c) => String(c) === v)) return capacitateGrupaOptions
  return [...capacitateGrupaOptions, { value: v, label: `${v} (nestandard)` }]
}
