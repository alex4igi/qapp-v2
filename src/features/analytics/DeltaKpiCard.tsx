import type { ReactNode } from 'react'

type Props = {
  label: string
  value: ReactNode
  sub?: ReactNode
  hint?: string
  /** Δ vs. săptămâna trecută (sau perioada anterioară). null/undefined → „—". */
  deltaPrev?: number | null
  /** Δ vs. aceeași săptămână anul trecut. null/undefined → „—". */
  deltaYoy?: number | null
  /** Sufix pe delte (ex. „pp" pentru procente). */
  deltaSuffix?: string
  /** true = scăderea e bună (churn, risc, restanțe). */
  polaritateInversa?: boolean
  hero?: boolean
}

function DeltaChip({
  delta,
  eticheta,
  suffix,
  polaritateInversa,
}: {
  delta: number | null | undefined
  eticheta: string
  suffix: string
  polaritateInversa: boolean
}) {
  if (delta == null || Number.isNaN(delta)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-quasar-gray-light px-2 py-0.5 text-[11px] text-muted-2">
        — {eticheta}
      </span>
    )
  }
  const bun = polaritateInversa ? delta < 0 : delta > 0
  const neutru = delta === 0
  const cls = neutru
    ? 'bg-quasar-gray-light text-muted'
    : bun
      ? 'bg-success/10 text-success'
      : 'bg-danger/10 text-danger'
  const semn = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '· '
  const val = Number.isInteger(delta) ? delta : delta.toFixed(1)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {semn}
      {val}
      {suffix} {eticheta}
    </span>
  )
}

export function DeltaKpiCard({
  label,
  value,
  sub,
  hint,
  deltaPrev,
  deltaYoy,
  deltaSuffix = '',
  polaritateInversa = false,
  hero = false,
}: Props) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`fnum mt-2.5 font-display font-bold tracking-tight text-ink ${hero ? 'text-4xl' : 'text-3xl'}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <DeltaChip delta={deltaPrev} eticheta="vs săpt. trecută" suffix={deltaSuffix} polaritateInversa={polaritateInversa} />
        <DeltaChip delta={deltaYoy} eticheta="vs anul trecut" suffix={deltaSuffix} polaritateInversa={polaritateInversa} />
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-2">{hint}</div>}
    </div>
  )
}
