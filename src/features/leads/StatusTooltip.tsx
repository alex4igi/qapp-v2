import type { ReactNode } from 'react'
import { Tooltip } from '@/components/ui'
import type { Lead, StatusLead } from '@/types/db'
import { STATUS_CONFIG } from './constants'
import { STATUS_PROCEDURA, TON_CLASE, actiuneCard } from './procedura'

function Sectiune({ eticheta, children, ton }: { eticheta: string; children: ReactNode; ton?: string }) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${ton ?? 'text-white/45'}`}>
        {eticheta}
      </div>
      <div className="mt-0.5 text-white/90">{children}</div>
    </div>
  )
}

// Tooltipul de pe card răspunde la întrebarea recepției — „am un card în
// coloană, ce fac cu el?" — nu la „ce înseamnă coloana". De aceea acțiunea e
// calculată din starea cardului, iar procedura coloanei vine abia sub ea.
export function CardTooltip({
  lead,
  areInrolare,
  children,
  className,
}: {
  lead: Lead
  areInrolare?: boolean
  children: ReactNode
  className?: string
}) {
  const a = actiuneCard(lead, { areInrolare })
  const p = STATUS_PROCEDURA[lead.status]
  return (
    <Tooltip
      className={className}
      content={
        <div className="space-y-2.5">
          <Sectiune eticheta="Ce faci cu el" ton={TON_CLASE[a.ton]}>
            <div className={`text-sm font-semibold ${TON_CLASE[a.ton]}`}>{a.text}</div>
            {a.detaliu && <div className="mt-1 text-white/65">{a.detaliu}</div>}
          </Sectiune>
          <div className="border-t border-white/15 pt-2">
            <Sectiune eticheta="Ce face aplicația">{p.peScurt.aplicatia}</Sectiune>
          </div>
          <div className="text-[10px] text-white/40">
            ℹ︎ din capul coloanei „{STATUS_CONFIG[lead.status].label}" = procedura completă
          </div>
        </div>
      }
    >
      {children}
    </Tooltip>
  )
}

// Tooltipul de pe status (cap de coloană, badge, pastilă) — procedura coloanei,
// pe scurt. Fără acțiune concretă: aici nu există un card anume.
export function StatusTooltip({
  status,
  children,
  className,
}: {
  status: StatusLead
  children: ReactNode
  className?: string
}) {
  const p = STATUS_PROCEDURA[status]
  return (
    <Tooltip
      className={className}
      content={
        <div className="space-y-2.5">
          <div>
            <div className="text-sm font-semibold text-quasar-yellow">
              {STATUS_CONFIG[status].label}
            </div>
            <div className="mt-0.5 text-white/65">{p.inseamna}</div>
          </div>
          <div className="space-y-2 border-t border-white/15 pt-2">
            <Sectiune eticheta="Ce faci tu">{p.peScurt.ceFaci}</Sectiune>
            <Sectiune eticheta="Ce face aplicația">{p.peScurt.aplicatia}</Sectiune>
          </div>
        </div>
      }
    >
      {children}
    </Tooltip>
  )
}
