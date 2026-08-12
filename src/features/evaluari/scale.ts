// Scala evaluărilor: DB-ul ține TREPTE (1–10), UI-ul arată STELE (0,5–5).
// O jumătate de stea = o treaptă. Conversia trăiește doar aici — orice loc care
// afișează o notă trece prin `toStele`, orice loc care scrie trece prin `toTrepte`.
// (Oglinda acestui fișier există în qapp-membri, lângă SKILLS.)

export const TREPTE_PE_STEA = 2
export const STELE_MAX = 5
export const TREPTE_MAX = STELE_MAX * TREPTE_PE_STEA

export function toStele(trepte: number | null | undefined): number | null {
  return trepte == null ? null : trepte / TREPTE_PE_STEA
}

export function toTrepte(stele: number): number {
  return Math.round(stele * TREPTE_PE_STEA)
}

/** „4,5" — cu virgulă zecimală, ca în restul UI-ului românesc. */
export function formatStele(trepte: number | null | undefined): string {
  const s = toStele(trepte)
  if (s == null) return '—'
  return s.toFixed(1).replace('.', ',')
}
