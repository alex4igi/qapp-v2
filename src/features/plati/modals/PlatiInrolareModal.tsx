import { Button, Modal } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { metodaTone } from '@/lib/metodaPlata'
import type { EnrollmentTender } from '../api'

type Props = {
  open: boolean
  clientNume?: string | null
  cursNume?: string | null
  tenders: EnrollmentTender[]
  onClose: () => void
  onCorect: (incasareId: string) => void
}

// Selector pentru înrolări cu mai multe plăți: front-desk alege plata de corectat.
export function PlatiInrolareModal({
  open,
  clientNume,
  cursNume,
  tenders,
  onClose,
  onCorect,
}: Props) {
  return (
    <Modal
      open={open}
      title="Plăți pe această înrolare"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Închide
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-quasar-gray">
          {clientNume ?? '—'}
          {cursNume ? ` · ${cursNume}` : ''}
        </p>
        <ul className="divide-y divide-gray-100">
          {tenders.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="text-quasar-gray">{t.data ?? '—'}</span>
              <span className="font-medium text-quasar-black">
                {formatRON(t.suma)}
              </span>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${metodaTone(
                  t.metoda ?? '',
                )}`}
              >
                {t.metoda ?? '—'}
              </span>
              <Button variant="ghost" onClick={() => onCorect(t.id)}>
                Corectează
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
