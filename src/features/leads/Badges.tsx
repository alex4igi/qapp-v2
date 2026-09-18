import type { StatusLead, SubStatusLead, GrupaLead } from '@/types/db'
import { STATUS_CONFIG, SUB_STATUS_OPTIONS, GRUPA_LABELS } from './constants'
import { StatusTooltip } from './StatusTooltip'

const base =
  'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border'

export function StatusBadge({ status }: { status: StatusLead }) {
  const c = STATUS_CONFIG[status]
  return (
    <StatusTooltip status={status}>
      <span className={`${base} ${c.bg} ${c.text} ${c.border} cursor-help`}>
        {c.label}
      </span>
    </StatusTooltip>
  )
}

const INTERES_COLORS: Record<string, string> = {
  'Street Dance': 'bg-sky-50 text-sky-700 border-sky-200',
  'K-pop': 'bg-pink-50 text-pink-700 border-pink-200',
  Zumba: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  Acrobatică: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Nu știu încă': 'bg-zinc-100 text-zinc-600 border-zinc-300',
}

export function InteresBadge({ interes }: { interes: string | null }) {
  if (!interes) return null
  const cls = INTERES_COLORS[interes] ?? 'bg-zinc-100 text-zinc-600 border-zinc-300'
  return <span className={`${base} ${cls}`}>{interes}</span>
}

export function GrupaBadge({ grupa }: { grupa: GrupaLead | null }) {
  if (!grupa) return null
  return (
    <span className={`${base} bg-yellow-50 text-yellow-800 border-yellow-200`}>
      {GRUPA_LABELS[grupa] ?? grupa}
    </span>
  )
}

// Rândurile de nurture generate pentru ex-clienți poartă `id_client` și au
// `created` = data rulării cronului. Fără eticheta asta sunt vizual identice cu
// un lead intrat azi din campanie — exact confuzia care a trimis pe cineva să
// caute „lead-uri proaspete căzute în nurture".
export function ExClientBadge() {
  return (
    <span
      className={`${base} border-teal-200 bg-teal-50 text-teal-700`}
      title="Ex-client — rând generat pentru pool-ul de reactivare, nu un lead nou"
    >
      ex-client
    </span>
  )
}

export function SursaBadge({ sursa }: { sursa: string | null }) {
  if (!sursa) return null
  return (
    <span className={`${base} bg-indigo-50 text-indigo-700 border-indigo-200`}>
      {sursa}
    </span>
  )
}

export function SubStatusBadge({
  subStatus,
}: {
  subStatus: SubStatusLead | null
}) {
  if (!subStatus) return null
  const opt = SUB_STATUS_OPTIONS.find((o) => o.value === subStatus)
  if (!opt) return null
  return <span className={`${base} ${opt.cls}`}>{opt.label}</span>
}
