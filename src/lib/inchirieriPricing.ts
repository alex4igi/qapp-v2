// Calcul preț închiriere sală + helpers de timp. Pur (fără side-effects, fără
// importuri), reutilizat de modulul plati (tab-ul de rezervare) și de calendarul
// de închirieri. Reguli de business (LOCKED cu userul):
//   - trepte fixe 60/90/120 din grilă;
//   - sub 60 min → tarif 60;
//   - peste 120 → pret_120 + increment_30 * ((durata-120)/30);
//   - rezervări în pași de 30 min;
//   - dacă treapta necesară e null (sală neconfigurată) → null (UI blochează).

export type TarifBracket = {
  pret_60: number | null
  pret_90: number | null
  pret_120: number | null
  increment_30: number | null
}

// Rotunjire la leu (evită prețuri urâte gen 137.5).
const roundLei = (n: number) => Math.round(n)

export function computePret(
  t: TarifBracket | null | undefined,
  durataMin: number,
): number | null {
  if (!t || !Number.isFinite(durataMin) || durataMin <= 0) return null

  if (durataMin <= 60) {
    return t.pret_60 == null ? null : roundLei(t.pret_60)
  }
  if (durataMin <= 90) {
    return t.pret_90 == null ? null : roundLei(t.pret_90)
  }
  if (durataMin <= 120) {
    return t.pret_120 == null ? null : roundLei(t.pret_120)
  }
  // > 120: bază 120 + increment per 30 min suplimentar.
  if (t.pret_120 == null || t.increment_30 == null) return null
  const extraSteps = Math.ceil((durataMin - 120) / 30)
  return roundLei(t.pret_120 + t.increment_30 * extraSteps)
}

// ---- Helpers timp (HH:MM / HH:MM:SS) ----

// "HH:MM[:SS]" → minute de la miezul nopții. null dacă invalid.
// Toleranță pentru date murdare: ora fără minute ("19") e tratată ca "19:00",
// altfel cursul ar dispărea tăcut din calendar/verificarea de conflict.
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const m = /^(\d{1,2})(?::(\d{2}))?/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] != null ? Number(m[2]) : 0
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// minute de la miezul nopții → "HH:MM". Se plafonează la 23:59.
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Ora de final dată ora de start + durata (min). null dacă start invalid.
export function computeOraFinal(
  oraStart: string | null | undefined,
  durataMin: number,
): string | null {
  const start = timeToMinutes(oraStart)
  if (start == null) return null
  return minutesToTime(start + durataMin)
}

// Suprapunere de intervale [aStart,aEnd) ∩ [bStart,bEnd) (în minute).
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd
}
