import type { ActCuPerformeri } from './api/lineup'

export type QuickChangeWarning = {
  client: string
  nume: string
  // Pozițiile (1-based, pentru afișare) actelor apropiate în care apare performerul.
  actA: { pos: number; titlu: string }
  actB: { pos: number; titlu: string }
  gap: number
}

// „Schimbare rapidă" = același dansator în două acte apropiate (gap = distanța în
// lineup). gap=1 → acte consecutive (spate-în-spate, cel mai riscant). Semnalăm orice
// pereche cu gap <= maxGap, ca regizorul să prevadă timp de schimbare costum/culise.
export function computeQuickChanges(
  acte: ActCuPerformeri[],
  maxGap = 1,
): QuickChangeWarning[] {
  // client → listă de aparții {pozitie, titlu, nume}
  const byClient = new Map<
    string,
    Array<{ pos: number; titlu: string; nume: string }>
  >()
  acte.forEach((act, idx) => {
    for (const p of act.performeri) {
      const list = byClient.get(p.client) ?? []
      list.push({
        pos: idx,
        titlu: act.titlu,
        nume: `${p.nume} ${p.prenume ?? ''}`.trim(),
      })
      byClient.set(p.client, list)
    }
  })

  const warnings: QuickChangeWarning[] = []
  for (const [client, appearances] of byClient) {
    // Actele sunt deja ordonate; comparăm aparții consecutive ale aceluiași client.
    for (let i = 1; i < appearances.length; i++) {
      const prev = appearances[i - 1]
      const cur = appearances[i]
      const gap = cur.pos - prev.pos
      if (gap <= maxGap) {
        warnings.push({
          client,
          nume: cur.nume,
          actA: { pos: prev.pos + 1, titlu: prev.titlu },
          actB: { pos: cur.pos + 1, titlu: cur.titlu },
          gap,
        })
      }
    }
  }
  // Cele mai riscante primele (gap mic), apoi alfabetic.
  return warnings.sort(
    (a, b) => a.gap - b.gap || a.nume.localeCompare(b.nume),
  )
}
