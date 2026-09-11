import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { statusSmsOptions } from '@/lib/enums'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher, isManagerOrHigher } from '@/lib/rolesMatrix'
import { SmsQueueForm } from './SmsQueueForm'
import { SmsComposer } from './SmsComposer'
import {
  listSmsQueue,
  deleteSmsQueueEntry,
  processSmsQueue,
  getSmsAmanateInfo,
  PAGE_SIZE,
  type SmsQueueRow,
} from './api'

const STATUS_STYLE: Record<string, string> = {
  'De trimis': 'text-amber-700',
  'In curs de trimitere': 'text-blue-700',
  Trimis: 'text-green-700',
  Esuat: 'text-red-600',
  Amanat: 'text-purple-700',
}

export function NotificariSmsPage() {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const poateMesajLiber = isManagerOrHigher(role)
  // Sub admin se șterg doar rândurile „De trimis" (RPC delete_sms_queue_entry refuză
  // restul) — dezactivăm butonul acolo unde ar eșua oricum.
  const poateStergeOrice = isAdminOrHigher(role)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [processMsg, setProcessMsg] = useState<string | null>(null)
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null)

  useEffect(() => setPage(0), [status])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sms-queue', { status, page }],
    queryFn: () => listSmsQueue({ status, page }),
    placeholderData: keepPreviousData,
  })

  // „Amânat" nu e o eroare: sunt SMS-uri prinse în zona interzisă, care pleacă singure
  // la ieșirea din fereastră. Fără contorul ăsta statusul arată ca un blocaj.
  const { data: amanate } = useQuery({
    queryKey: ['sms-amanate-info'],
    queryFn: getSmsAmanateInfo,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const remove = useMutation({
    mutationFn: deleteSmsQueueEntry,
    onSuccess: () => {
      setDeleteMsg(null)
      void queryClient.invalidateQueries({ queryKey: ['sms-queue'] })
    },
    onError: (e: unknown) =>
      setDeleteMsg(humanizeError(e, 'Ștergerea nu a reușit.')),
  })

  const process = useMutation({
    mutationFn: processSmsQueue,
    onSuccess: (res) => {
      setProcessMsg(
        `Procesate: ${res.total} · trimise: ${res.sent} · eșuate: ${res.failed}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['sms-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-amanate-info'] })
    },
    onError: (e: unknown) =>
      setProcessMsg(`Eroare: ${humanizeError(e, 'Eroare la procesare.')}`),
  })

  const columns: Column<SmsQueueRow>[] = [
    {
      header: 'Telefon',
      cell: (s) => s.telefon ?? '—',
      className: 'w-32',
      sortValue: (s) => s.telefon,
    },
    {
      header: 'Nume',
      cell: (s) => s.nume ?? '—',
      className: 'w-44',
      sortValue: (s) => s.nume?.toLowerCase(),
    },
    {
      header: 'Mesaj',
      cell: (s) => (
        <span className="line-clamp-2 text-quasar-gray">{s.mesaj ?? '—'}</span>
      ),
      sortValue: (s) => s.mesaj?.toLowerCase(),
    },
    {
      header: 'Status',
      cell: (s) => (
        <span
          className={`font-medium ${
            s.status ? (STATUS_STYLE[s.status] ?? '') : ''
          }`}
        >
          {s.status ?? '—'}
        </span>
      ),
      className: 'w-36',
      sortValue: (s) => s.status?.toLowerCase(),
    },
    {
      header: 'Planificat',
      cell: (s) => s.data_planificata ?? '—',
      className: 'w-28',
      sortValue: (s) => s.data_planificata,
    },
    {
      header: 'Trimis',
      cell: (s) => s.data_trimitere ?? '—',
      className: 'w-28',
      sortValue: (s) => s.data_trimitere,
    },
    {
      header: '',
      cell: (s) => {
        const stergibil = poateStergeOrice || s.status === 'De trimis'
        return (
          <Button
            variant="ghost"
            onClick={() => remove.mutate(s.id)}
            disabled={remove.isPending || !stergibil}
            title={stergibil ? undefined : 'Se pot șterge doar SMS-urile „De trimis"'}
          >
            Șterge
          </Button>
        )
      },
      className: 'w-24',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Notificări SMS"
        actions={
          <>
            <Button variant="secondary" onClick={() => setComposerOpen(true)}>
              Generează SMS-uri
            </Button>
            {poateMesajLiber && (
              <Button variant="ghost" onClick={() => setFormOpen(true)}>
                + SMS manual
              </Button>
            )}
            <Button
              onClick={() => {
                if (
                  !window.confirm(
                    'Sigur pornești trimiterea? TOATE SMS-urile cu status „De trimis" vor fi trimise efectiv.',
                  )
                )
                  return
                setProcessMsg(null)
                process.mutate()
              }}
              disabled={process.isPending}
            >
              {process.isPending
                ? 'Se procesează…'
                : 'Trimite cele de trimis'}
            </Button>
          </>
        }
      />

      {deleteMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {deleteMsg}
        </div>
      )}

      {!!amanate?.count && (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-800">
          <strong>{amanate.count}</strong>{' '}
          {amanate.count === 1 ? 'SMS amânat' : 'SMS-uri amânate'} de zona
          interzisă — pleacă automat {amanate.azi ? 'azi' : 'mâine'} la{' '}
          {amanate.oraPlecare}. Nu trebuie să faci nimic.
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="w-52">
          <Select
            placeholder="Toate statusurile"
            options={statusSmsOptions}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        {processMsg && (
          <span className="text-sm text-quasar-black">{processMsg}</span>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {humanizeError(error)}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(s) => s.id}
            emptyMessage="Coada de SMS-uri este goală."
          />

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              Pagina {page + 1} din {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Următor →
              </Button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <SmsQueueForm open onClose={() => setFormOpen(false)} />
      )}
      {composerOpen && (
        <SmsComposer open onClose={() => setComposerOpen(false)} />
      )}
    </div>
  )
}
