import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { VPlatiInrolari } from '@/types/db'
import { EnrollmentForm } from './EnrollmentForm'
import { IncasareForm } from './IncasareForm'
import { listPlatiInrolari, PAGE_SIZE } from './api'

export function PlatiListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [payFor, setPayFor] = useState<VPlatiInrolari | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['plati', { search, page }],
    queryFn: () => listPlatiInrolari({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const columns: Column<VPlatiInrolari>[] = [
    {
      header: 'Client',
      sortValue: (r) =>
        `${r.nume_client ?? ''} ${r.prenume_client ?? ''}`.trim().toLowerCase(),
      cell: (r) =>
        r.id_cursant ? (
          <Link
            to={`/clienti/${r.id_cursant}`}
            className="font-medium text-quasar-black hover:underline"
          >
            {r.nume_client} {r.prenume_client ?? ''}
          </Link>
        ) : (
          <span className="font-medium">
            {r.nume_client} {r.prenume_client ?? ''}
          </span>
        ),
    },
    {
      header: 'Curs',
      cell: (r) => r.nume_curs ?? '—',
      sortValue: (r) => r.nume_curs,
    },
    {
      header: 'Început',
      cell: (r) => r.data_incepere ?? '—',
      className: 'w-28',
      sortValue: (r) => r.data_incepere,
    },
    {
      header: 'Tip plată',
      cell: (r) => r.tip_plata ?? '—',
      sortValue: (r) => r.tip_plata,
    },
    {
      header: 'Total',
      cell: (r) => `${r.total_de_plata ?? 0} RON`,
      className: 'w-24',
      sortValue: (r) => r.total_de_plata ?? 0,
    },
    {
      header: 'Plătit',
      cell: (r) => `${r.platit ?? 0} RON`,
      className: 'w-24',
      sortValue: (r) => r.platit ?? 0,
    },
    {
      header: 'Rest',
      cell: (r) => {
        const rest = (r.total_de_plata ?? 0) - (r.platit ?? 0)
        return (
          <span className={rest > 0 ? 'font-semibold text-red-600' : ''}>
            {rest} RON
          </span>
        )
      },
      className: 'w-24',
      sortValue: (r) => (r.total_de_plata ?? 0) - (r.platit ?? 0),
    },
    {
      header: '',
      cell: (r) => (
        <Button variant="secondary" onClick={() => setPayFor(r)}>
          + Plată
        </Button>
      ),
      className: 'w-28',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Plăți"
        subtitle={data ? `${data.total} înrolări` : undefined}
        actions={
          <Button onClick={() => setEnrollOpen(true)}>
            + Înrolare nouă
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după client sau curs…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
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
            rowKey={(r) => r.id_enrollment ?? String(r.id)}
            emptyMessage="Nicio înrolare."
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

      {enrollOpen && (
        <EnrollmentForm open onClose={() => setEnrollOpen(false)} />
      )}
      {payFor && (
        <IncasareForm
          open
          enrollment={payFor}
          onClose={() => setPayFor(null)}
        />
      )}
    </div>
  )
}
