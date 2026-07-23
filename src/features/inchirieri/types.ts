// Interval ocupat pe un slot din calendar (curs recurent proiectat SAU închiriere).
export type OccupKind =
  | 'curs'
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
