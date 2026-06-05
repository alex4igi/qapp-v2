import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  PageHeader,
  Select,
  Spinner,
  Modal,
  DataTable,
  type Column,
} from '@/components/ui'
import { listSezoane } from '@/features/setari/api'
import {
  getReinscrieriProgress,
  listReinscrieriClienti,
  activateReinscriereLaSezon,
  type ReinscriereProgresRow,
  type ReinscriereClientRow,
} from './api'

export function ReinscrieriPage() {
  const queryClient = useQueryClient()
  const [sezonId, setSezonId] = useState('')
  const [openCurs, setOpenCurs] = useState<ReinscriereProgresRow | null>(null)

  const sezoaneQ = useQuery({ queryKey: ['sezoane'], queryFn: listSezoane })

  const sezoaneOptions = useMemo(
    () =>
      (sezoaneQ.data ?? [])
        .filter((s) => s.tip === 'principal' && s.stare === 'planificat')
        .map((s) => ({ value: s.id, label: s.numele_sezonului })),
    [sezoaneQ.data],
  )

  // Auto-selectează primul sezon planificat dacă nu e nimic selectat
  useEffect(() => {
    if (!sezonId && sezoaneOptions.length > 0) {
      setSezonId(sezoaneOptions[0].value)
    }
  }, [sezonId, sezoaneOptions])

  const progresQ = useQuery({
    queryKey: ['reinscrieri', 'progres', sezonId],
    enabled: Boolean(sezonId),
    queryFn: () => getReinscrieriProgress(sezonId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['reinscrieri', 'progres', sezonId],
    })
    if (openCurs) {
      void queryClient.invalidateQueries({
        queryKey: ['reinscrieri', 'clienti', openCurs.curs_id],
      })
    }
  }

  const columns: Column<ReinscriereProgresRow>[] = [
    { header: 'Curs', cell: (r) => <span className="font-medium">{r.curs_nume}</span> },
    { header: 'Grupă', cell: (r) => r.varsta ?? '—', className: 'w-32' },
    {
      header: 'Eligibili',
      cell: (r) => r.total_eligibili,
      className: 'w-24 text-right',
    },
    {
      header: 'Activați',
      cell: (r) => (
        <span className="font-semibold text-quasar-black">{r.activati}</span>
      ),
      className: 'w-24 text-right',
    },
    {
      header: 'Rămași',
      cell: (r) => r.ramasi,
      className: 'w-24 text-right',
    },
    {
      header: 'Progres',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-quasar-gray/30">
            <div
              className="h-full bg-quasar-yellow"
              style={{ width: `${Math.min(100, r.procent)}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm">{r.procent}%</span>
        </div>
      ),
      className: 'w-48',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Campania Reînscrieri"
        subtitle="Progres per grupă pentru sezonul țintă (planificat)."
        actions={
          <div className="w-72">
            {sezoaneQ.isLoading ? (
              <Spinner />
            ) : sezoaneOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Nu există niciun sezon principal planificat.
              </p>
            ) : (
              <Select
                options={sezoaneOptions}
                value={sezonId}
                onChange={(e) => setSezonId(e.target.value)}
              />
            )}
          </div>
        }
      />

      {!sezonId ? (
        <p className="text-sm text-quasar-gray">Alege un sezon țintă.</p>
      ) : progresQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={progresQ.data ?? []}
          rowKey={(r) => r.curs_id}
          onRowClick={(r) => setOpenCurs(r)}
          emptyMessage="Niciun curs în sezonul țintă."
        />
      )}

      {openCurs && (
        <CursReinscrieriModal
          curs={openCurs}
          onClose={() => setOpenCurs(null)}
          onChange={invalidate}
        />
      )}
    </div>
  )
}

// ============================================================================
// Modal: clienții eligibili pentru un curs țintă
// ============================================================================

function CursReinscrieriModal(props: {
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
      setError(e instanceof Error ? e.message : 'Eroare la activare.'),
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
      setError(e instanceof Error ? e.message : 'Eroare la activare în bulk.'),
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
