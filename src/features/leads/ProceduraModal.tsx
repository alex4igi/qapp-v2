import { Modal } from '@/components/ui'
import type { StatusLead } from '@/types/db'
import { STATUS_CONFIG } from './constants'
import { STATUS_PROCEDURA } from './procedura'

type Props = {
  status: StatusLead | null
  onClose: () => void
}

function Lista({ titlu, randuri }: { titlu: string; randuri: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-quasar-gray">
        {titlu}
      </h3>
      <ul className="mt-1.5 space-y-1.5">
        {randuri.map((r) => (
          <li key={r} className="flex gap-2 text-sm leading-snug text-quasar-black">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-quasar-yellow" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ProceduraModal({ status, onClose }: Props) {
  if (!status) return null
  const p = STATUS_PROCEDURA[status]
  const cfg = STATUS_CONFIG[status]

  return (
    <Modal open title={`Procedura — ${cfg.label}`} onClose={onClose}>
      <div className="space-y-4">
        <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
          {p.inseamna}
        </p>
        <Lista titlu="Ce faci tu" randuri={p.ceFaci} />
        <Lista titlu="Ce face aplicația singură" randuri={p.aplicatia} />
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-quasar-gray">
            Pe unde iese
          </h3>
          <p className="mt-1.5 text-sm text-quasar-black">{p.iesiri}</p>
        </section>
      </div>
    </Modal>
  )
}
