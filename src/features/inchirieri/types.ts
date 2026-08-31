// Interval ocupat pe un slot din calendar (curs recurent proiectat, închiriere,
// clasă demo sau alt eveniment cu sală).
export type OccupKind =
  | 'curs'
  | 'demo'
  | 'eveniment'
  | 'inchiriere-achitata'
  | 'inchiriere-restanta'
  | 'inchiriere-gratis'

export type BusyInterval = {
  startMin: number // minute de la miezul nopții
  endMin: number
  label: string
  kind: OccupKind
  inchiriereId?: string // doar pentru închirieri (click → editare/anulare)
}
