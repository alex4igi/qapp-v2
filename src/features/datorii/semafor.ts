import type { Prag } from '@/features/scorecard/api'

export type Semafor = 'verde' | 'galben' | 'rosu'

// Pragurile semaforului vin din configul existent scorecard_praguri.rata_restante
// (directie mai_mic_e_bine: peste=excelent, standard=acceptabil). Fallback-urile
// 5/7 = valorile seed — folosite doar până se încarcă pragurile.
export function praguriRata(praguri: Prag[] | undefined): {
  peste: number
  standard: number
} {
  const p = praguri?.find((x) => x.cheie === 'rata_restante')
  return {
    peste: Number(p?.prag_peste ?? 5),
    standard: Number(p?.prag_standard ?? 7),
  }
}

export function semaforRataRestante(
  rataPct: number | null,
  praguri: Prag[] | undefined,
): Semafor | null {
  if (rataPct == null) return null
  const { peste, standard } = praguriRata(praguri)
  if (rataPct <= peste) return 'verde'
  if (rataPct <= standard) return 'galben'
  return 'rosu'
}

export const SEMAFOR_TONE: Record<Semafor, 'positive' | 'warning' | 'negative'> = {
  verde: 'positive',
  galben: 'warning',
  rosu: 'negative',
}

export const SEMAFOR_DOT: Record<Semafor, string> = {
  verde: 'bg-emerald-500',
  galben: 'bg-amber-400',
  rosu: 'bg-red-500',
}

export function fereastraRecuperare(praguri: Prag[] | undefined): number {
  const p = praguri?.find((x) => x.cheie === 'recuperare_fereastra_zile')
  return Number(p?.prag_standard ?? 7)
}
