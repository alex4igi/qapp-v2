import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tooltip } from '@/components/ui'

export type Comparatie = {
  delta: number
  /** Perioada reală a reperului, ex. „vs 25 oct. 2025". Niciodată un text fix. */
  eticheta: string
  /** Sufix pe deltă (ex. „pp", „%"). */
  suffix?: string
  /** true = scăderea e bună. */
  polaritateInversa?: boolean
}

type Props = {
  label: string
  value: ReactNode
  sub?: ReactNode
  comparatie?: Comparatie | null
  /** De ce nu se compară (când `comparatie` lipsește). */
  motiv?: string | null
  /** Avertisment pe o comparație afișată. */
  nota?: string | null
  info?: ReactNode
  to?: string
}

function DeltaChip({ delta, eticheta, suffix = '', polaritateInversa = false }: Comparatie) {
  const bun = polaritateInversa ? delta < 0 : delta > 0
  const cls =
    delta === 0 ? 'bg-quasar-gray-light text-muted' : bun ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
  const semn = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '· '
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {semn}
      {Math.abs(delta).toLocaleString('ro-RO', { maximumFractionDigits: 1 })}
      {suffix} {eticheta}
    </span>
  )
}

export function DeltaKpiCard({ label, value, sub, comparatie, motiv, nota, info, to }: Props) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        {info && (
          <Tooltip content={info} width={320}>
            <span
              role="button"
              tabIndex={0}
              aria-label="Cum se calculează"
              className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted transition-colors hover:border-ink hover:text-ink focus:border-ink focus:text-ink focus:outline-none"
            >
              i
            </span>
          </Tooltip>
        )}
      </div>
      <div className="fnum mt-2.5 font-display text-3xl font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {comparatie ? (
          <DeltaChip {...comparatie} />
        ) : motiv ? (
          <span className="text-[11px] text-muted-2">Fără comparație: {motiv}</span>
        ) : null}
      </div>
      {comparatie && nota && <div className="mt-1.5 text-[11px] text-warn">{nota}</div>}
    </>
  )

  const clase = 'block rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md'
  return to ? (
    <Link to={to} className={clase}>
      {body}
    </Link>
  ) : (
    <div className={clase}>{body}</div>
  )
}
