import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  Badge,
  TextInput,
  Select,
  Field,
  DataTable,
  Spinner,
  type Column,
  type BadgeTone,
} from '@/components/ui'
import type { Client } from '@/types/db'
import { ChecklistBadge } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import { CLIENT_CHECKLIST } from '@/lib/checklist/specs/client'
import { useAuth } from '@/hooks/useAuth'
import { isFrontDeskOrHigher } from '@/lib/rolesMatrix'
import { ClientForm } from './ClientForm'
import { LogReactivareModal } from './LogReactivareModal'
import { listClienti, PAGE_SIZE, type ClientCuDocumente } from './api'

const STATUS_OPTIONS = [
  { label: 'Activ', value: 'Activ' },
  { label: 'Inactiv', value: 'Inactiv' },
  { label: 'EXclient', value: 'EXclient' },
]

function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'Activ':
      return 'success'
    case 'Programat':
    case 'Lead':
      return 'warn'
    default:
      return 'neutral'
  }
}

const columns: Column<ClientCuDocumente>[] = [
  {
    header: 'Nume',
    cell: (c) => (
      <span className="font-medium">
        {c.nume} {c.prenume ?? ''}
      </span>
    ),
    sortValue: (c) => `${c.nume ?? ''} ${c.prenume ?? ''}`.trim().toLowerCase(),
  },
  { header: 'Telefon', cell: (c) => c.telefon ?? '—', sortValue: (c) => c.telefon?.toLowerCase() },
  { header: 'Email', cell: (c) => c.email ?? '—', sortValue: (c) => c.email?.toLowerCase() },
  {
    header: 'Status',
    cell: (c) =>
      c.status ? <Badge tone={statusTone(c.status)}>{c.status}</Badge> : '—',
    className: 'w-28',
    sortValue: (c) => c.status?.toLowerCase(),
  },
]

// Rândurile listei sunt rânduri `clienti` complete plus embed-ul de documente,
// deci checklistul se evaluează direct pe ele — fără query companion.
const coloanaFisa: Column<ClientCuDocumente> = {
  header: 'Fișă',
  cell: (c) => (
    <ChecklistBadge rezultat={evalueazaChecklist(CLIENT_CHECKLIST, c)} compact />
  ),
  className: 'w-20',
  sortValue: (c) => {
    const rez = evalueazaChecklist(CLIENT_CHECKLIST, c)
    return rez.lipsaEsentiale.length * 100 + rez.lipsaRecomandate.length
  },
}

export function ClientiListPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  // Fișa clientului o completează recepția — teacherul o vede read-only oricum.
  const vedeFisa = isFrontDeskOrHigher(role)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [reactivareClient, setReactivareClient] = useState<Client | null>(null)

  // Debounce căutare
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clienti', { search, page, status }],
    queryFn: () => listClienti({ search, page, status: status || null }),
    placeholderData: keepPreviousData,
  })

  // Pentru clienții inactivi/exclienți: buton de log reactivare (Faza 3 scorecard).
  const tableColumns: Column<ClientCuDocumente>[] = [
    ...columns,
    ...(vedeFisa ? [coloanaFisa] : []),
    {
      header: '',
      cell: (c) =>
        c.status === 'Inactiv' || c.status === 'EXclient' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setReactivareClient(c)
            }}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted-2 transition-colors hover:border-quasar-yellow hover:text-ink"
            title="Loghează contact de reactivare"
          >
            📞 Reactivare
          </button>
        ) : null,
      className: 'w-36 text-right',
    },
  ]

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Clienți"
        subtitle={data ? `${data.total} clienți` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Client nou</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Caută" htmlFor="cl-search">
            <TextInput
              id="cl-search"
              placeholder="Caută după nume, telefon, email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Status" htmlFor="cl-status">
            <Select
              id="cl-status"
              placeholder="Toate statusurile"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
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
            columns={tableColumns}
            rows={data?.rows ?? []}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/clienti/${c.id}`)}
            emptyMessage="Niciun client găsit."
          />

          <div className="mt-4 flex items-center justify-between text-sm text-muted">
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
        <ClientForm open onClose={() => setFormOpen(false)} />
      )}

      {reactivareClient && (
        <LogReactivareModal
          open
          client={reactivareClient}
          onClose={() => setReactivareClient(null)}
        />
      )}
    </div>
  )
}
