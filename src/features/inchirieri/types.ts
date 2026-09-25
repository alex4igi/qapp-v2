// Interval ocupat pe un slot din calendar (curs recurent proiectat, închiriere,
// clasă demo sau alt eveniment cu sală).
export type OccupKind =
  | 'curs'
  | 'demo'
  | 'eveniment'
  | 'inchiriere-achitata'
  | 'inchiriere-restanta'
  | 'inchiriere-gratis'
  // Rezervarea altcuiva, văzută de un instructor: doar intervalul, fără chiriaș/bani.
  | 'inchiriere-ocupata'

export type BusyInterval = {
  startMin: number // minute de la miezul nopții
  endMin: number
  label: string
  kind: OccupKind
  inchiriereId?: string // doar pentru închirierile vizibile (click → editare/anulare)
}
