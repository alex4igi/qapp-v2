import { humanizeError } from '@/lib/errorMessage'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Modal, Spinner } from '@/components/ui'
import {
  listReinscrieriClienti,
  activateReinscriereLaSezon,
  type ReinscriereProgresRow,
  type ReinscriereClientRow,
} from '../api'

// Modal per curs pentru fluxul clasic (fără campanie): activare individuală/bulk.
export function LegacyCursModal(props: {
  curs: ReinscriereProgresRow
  onClose: () => void
  onChange: () => void
}) {
  const { curs } = props
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['reinscrieri', 'clienti', curs.curs_id],
    queryFn: () => listReinscrieriClienti(curs.curs_id),
  })

  const activate = useMutation({
    mutationFn: (clientId: string) =>
      activateReinscriereLaSezon(clientId, curs.curs_id),
    onSuccess: () => {
      void clientiQ.refetch()
      props.onChange()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la activare.')),
  })

  const activateBulk = useMutation({
    mutationFn: async (clienti: ReinscriereClientRow[]) => {
      for (const c of clienti) {
        if (c.activata) continue
        await activateReinscriereLaSezon(c.client_id, curs.curs_id)
      }
    },
    onSuccess: () => {
      void clientiQ.refetch()
      props.onChange()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la activare în bulk.')),
  })

  const ramasi = (clientiQ.data ?? []).filter((c) => !c.activata)

  return (
    <Modal
      open
      title={`Reînscrieri — ${curs.curs_nume}`}
      onClose={props.onClose}
      size="lg"
      footer={
        <>
          {ramasi.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => activateBulk.mutate(clientiQ.data ?? [])}
              disabled={activateBulk.isPending}
            >
              Activează toți ({ramasi.length})
            </Button>
          )}
          <Button onClick={props.onClose}>Închide</Button>
        </>
      }
    >
      {clientiQ.isLoading ? (
        <Spinner />
      ) : (clientiQ.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun client eligibil pe acest curs.
        </p>
      ) : (
        <ul className="divide-y divide-quasar-gray/30">
          {(clientiQ.data ?? []).map((c) => (
            <li
              key={c.client_id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <span className="font-medium">
                  {c.nume} {c.prenume ?? ''}
                </span>
                {c.telefon && (
                  <span className="ml-2 text-quasar-gray">{c.telefon}</span>
                )}
              </div>
              {c.activata ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                  ✓ Activat
                </span>
              ) : (
                <Button
                  className="text-xs"
                  onClick={() => activate.mutate(c.client_id)}
                  disabled={activate.isPending}
                >
                  Activează
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  )
}
