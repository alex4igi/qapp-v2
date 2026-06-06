import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Spinner } from '@/components/ui'
import type { Anunt } from '@/types/db'
import { getReadReceipts, markAnuntRead } from './api'

type Props = {
  anunt: Anunt
  mode: 'primit' | 'trimis'
  onClose: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AnuntDetailModal({ anunt, mode, onClose }: Props) {
  const queryClient = useQueryClient()

  const markRead = useMutation({
    mutationFn: () => markAnuntRead(anunt.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['anunturi'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari-unread'] })
    },
  })

  // Deschiderea unui anunț primit îl marchează citit.
  useEffect(() => {
    if (mode === 'primit') markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anunt.id, mode])

  const receiptsQ = useQuery({
    queryKey: ['anunt-receipts', anunt.id],
    queryFn: () => getReadReceipts(anunt.id),
    enabled: mode === 'trimis',
  })

  return (
    <Modal
      open
      title={anunt.titlu}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Închide
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-quasar-gray">
          {mode === 'primit' && anunt.expeditor_email && (
            <span>De la: {anunt.expeditor_email}</span>
          )}
          <span>{formatDate(anunt.created)}</span>
        </div>

        <p className="whitespace-pre-wrap rounded-md bg-quasar-gray-light/40 p-3 text-sm text-quasar-black">
          {anunt.continut}
        </p>

        {mode === 'trimis' && (
          <div className="border-t border-quasar-gray-light pt-3 text-sm">
            {receiptsQ.isLoading ? (
              <Spinner />
            ) : (
              <p className="text-quasar-black">
                Citit de{' '}
                <span className="font-medium">
                  {receiptsQ.data?.citite ?? 0}
                </span>{' '}
                din {receiptsQ.data?.total ?? anunt.nr_destinatari}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
