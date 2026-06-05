import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import type { AppFeedback, AppFeedbackStatus } from '@/types/db'
import { STATUS_BADGE, STATUS_LABEL, TIP_LABEL, statusOptions } from './constants'
import { AppFeedbackModal } from './AppFeedbackModal'
import { AppFeedbackTriageModal } from './AppFeedbackTriageModal'
import { getAppFeedback, listAppFeedback, PAGE_SIZE } from './api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const columns: Column<AppFeedback>[] = [
  {
    header: 'Tip',
    cell: (f) => <span className="whitespace-nowrap">{TIP_LABEL[f.tip]}</span>,
    className: 'w-28',
  },
  {
    header: 'Titlu',
    cell: (f) => <span className="font-medium">{f.titlu}</span>,
  },
  {
    header: 'Autor',
    cell: (f) => (
      <span className="text-quasar-gray">{f.autor_email ?? '—'}</span>
    ),
  },
  {
    header: 'Pagina',
    cell: (f) => (
      <span className="text-quasar-gray">{f.pagina ?? '—'}</span>
    ),
    className: 'w-40',
  },
  {
    header: 'Status',
    cell: (f) => (
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[f.status]}`}
      >
        {STATUS_LABEL[f.status]}
      </span>
    ),
    className: 'w-28',
  },
  {
    header: 'Data',
    cell: (f) => (
      <span className="whitespace-nowrap text-quasar-gray">
        {formatDate(f.created)}
      </span>
    ),
    className: 'w-28',
  },
]

export function AppFeedbackListPage() {
  const { role } = useAuth()
  const isAdmin = isAdminOrHigher(role)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<AppFeedbackStatus | ''>('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<AppFeedback | null>(null)

  // Deschidere directă din notificare (?feedback=<id>): încarcă rândul și
  // deschide modalul de triere, apoi curăță param-ul ca să nu redeschidă.
  const [searchParams, setSearchParams] = useSearchParams()
  const feedbackParam = searchParams.get('feedback')
  useEffect(() => {
    if (!feedbackParam) return
    let cancelled = false
    void getAppFeedback(feedbackParam).then((f) => {
      if (cancelled) return
      if (f) setSelected(f)
      // Curățăm param-ul abia după fetch, ca să nu redeschidă la refresh.
      setSearchParams(
        (prev) => {
          prev.delete('feedback')
          return prev
        },
        { replace: true },
      )
    })
    return () => {
      cancelled = true
    }
  }, [feedbackParam, setSearchParams])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['app-feedback', { search, status, page }],
    queryFn: () => listAppFeedback({ search, status, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Feedback aplicație' : 'Feedback-ul meu'}
        subtitle={
          isAdmin
            ? data
              ? `${data.total} de la testeri`
              : undefined
            : 'Sugestiile și bug-urile trimise de tine'
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>+ Trimite feedback</Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="max-w-sm flex-1">
          <TextInput
            placeholder="Caută după titlu sau detalii…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            placeholder="Toate statusurile"
            options={statusOptions}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AppFeedbackStatus | '')
              setPage(0)
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(f) => f.id}
            onRowClick={(f) => setSelected(f)}
            emptyMessage={
              isAdmin
                ? 'Niciun feedback încă.'
                : 'Nu ai trimis încă feedback. Folosește „+ Trimite feedback”.'
            }
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

      {createOpen && (
        <AppFeedbackModal open onClose={() => setCreateOpen(false)} />
      )}
      {selected && (
        <AppFeedbackTriageModal
          feedback={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
