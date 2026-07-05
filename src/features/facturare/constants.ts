// Lista fixă de articole de vânzare FGO (nomenclatorul din FGO.ro). Recepția
// poate alege/edita manual articolul la facturare; rezolverul îl pre-completează
// automat din ce s-a plătit (vezi articolResolver.ts). Fixă acum — se poate muta
// în Setări/DB ulterior.
export const ARTICOLE_FGO = [
  'Sedinta dans gimnastica',
  'Sedinta dans gimnastica promo',
  'Abonament dans gimnastica',
  'Abonament dans gimnastica promo',
  'Abonament anual dans gimnastica promo',
  'Taxa workshop',
  'Taxa concurs',
  'Taxa Reinscriere',
  'Taxa confirmare loc',
  'Articole vestimentar',
  'Bilet spectacol',
  'Sedinta privata',
  'Moment coregrafic',
] as const

export type ArticolFgo = (typeof ARTICOLE_FGO)[number]
