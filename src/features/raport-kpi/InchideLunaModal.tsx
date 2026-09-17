import { Modal, Button } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { LUNI_LUNG, type RaportKpi } from './types'

type Props = {
  open: boolean
  raport: RaportKpi
  eroare: string | null
  seLucreaza: boolean
  onClose: () => void
  onConfirm: () => void
}

export function InchideLunaModal({ open, raport, eroare, seLucreaza, onClose, onConfirm }: Props) {
  const blocat = raport.blocante.length > 0

  return (
    <Modal
      open={open}
      title={`Închide ${LUNI_LUNG[raport.luna - 1]} ${raport.anul}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={onConfirm} disabled={blocat || seLucreaza}>
            {seLucreaza ? 'Se închide…' : 'Închide luna'}
          </Button>
        </>
      }
    >
      {blocat ? (
        <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          <div className="mb-1 font-semibold">Luna nu poate fi închisă încă:</div>
          <ul className="list-inside list-disc">
            {raport.blocante.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            După închidere, valorile și configurația grilei se îngheață pe rândul lunii. Raportul
            rămâne citibil identic peste un an, chiar dacă grila se schimbă între timp. Doar
            owner-ul poate redeschide.
          </p>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between border-b border-line py-1">
              <dt className="text-muted">Titular</dt>
              <dd className="font-medium text-ink">{raport.grila.titular_nume}</dd>
            </div>
            <div className="flex justify-between border-b border-line py-1">
              <dt className="text-muted">Bonus titular</dt>
              <dd className="font-bold text-ink">{formatRON(raport.bonus_titular)}</dd>
            </div>
            <div className="flex justify-between border-b border-line py-1">
              <dt className="text-muted">Fond total (cu cota managerului)</dt>
              <dd className="font-medium text-ink">{formatRON(raport.fond_total)}</dd>
            </div>
          </dl>
          {raport.avertismente.length > 0 && (
            <div className="mt-4 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              {raport.avertismente.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          )}
        </>
      )}

      {eroare && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {eroare}
        </div>
      )}
    </Modal>
  )
}
