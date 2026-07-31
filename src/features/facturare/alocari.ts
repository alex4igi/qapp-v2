import type { Alocare, FacturaLinie, FacturaRow } from './types'

// Derivările peste alocările unui transfer bancar. Banii stau o singură dată, în
// `linii` (fiecare linie etichetată cu `client_id`); tot ce ține de „cât" și „e plătit"
// se calculează de aici, ca BancaTab / ClientiAlocati / FacturaDialog să nu diveargă.

export const round2 = (n: number) => Math.round(n * 100) / 100

const liniiRow = (row: FacturaRow): FacturaLinie[] => row.linii ?? []

export const liniiAlocare = (row: FacturaRow, clientId: string) =>
  liniiRow(row).filter((l) => l.client_id === clientId)

export const liniiNealocate = (row: FacturaRow) => liniiRow(row).filter((l) => !l.client_id)

export const sumaAlocare = (row: FacturaRow, clientId: string) =>
  round2(liniiAlocare(row, clientId).reduce((s, l) => s + Number(l.suma || 0), 0))

export const sumaAlocata = (row: FacturaRow) =>
  round2(liniiRow(row).reduce((s, l) => s + Number(l.suma || 0), 0))

export const restNealocat = (row: FacturaRow) => round2(row.suma - sumaAlocata(row))

// Rândurile plătite ÎNAINTE de alocări au linii fără client_id: banii sunt deja încasați,
// deci niciun buton „Plată" nu mai are voie să apară pe ele (s-ar dubla încasarea).
export const platitLegacy = (row: FacturaRow) =>
  !!row.platit_la && liniiNealocate(row).length > 0

export const estePlatita = (row: FacturaRow, clientId: string) =>
  platitLegacy(row) || liniiAlocare(row, clientId).length > 0

// Registrul rămâne onest: cu 2+ beneficiari niciun client nu e „clientul facturii", deci
// client_id e null. familia_id se propagă doar dacă toți au aceeași familie — e cheia pe
// care buildClient (edge fn autofgo) o folosește pentru ramura PJ.
export const clientIdRegistru = (alocari: Alocare[]) =>
  alocari.length === 1 ? alocari[0].client_id : null

export const familiaIdRegistru = (alocari: Alocare[]) => {
  if (alocari.length === 0 || alocari.some((a) => !a.familia_id)) return null
  const fams = new Set(alocari.map((a) => a.familia_id as string))
  return fams.size === 1 ? [...fams][0] : null
}
