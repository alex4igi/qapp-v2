import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { Familie } from '@/types/db'
import { ChecklistBadge } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import { FAMILIE_CHECKLIST } from '@/lib/checklist/specs/familie'
import { useAuth } from '@/hooks/useAuth'
import { isFrontDeskOrHigher } from '@/lib/rolesMatrix'
import { FamilieForm } from './FamilieForm'
import { GenereazaFamiliiModal } from './GenereazaFamiliiModal'
import { listFamilii, PAGE_SIZE } from './api'

const columns: Column<Familie>[] = [
  {
    header: 'Familie',
    cell: (f) => <span className="font-medium">{f.nume_familie}</span>,
    sortValue: (f) => f.nume_familie?.toLowerCase(),
  },
  {
    header: 'Reprezentant',
    cell: (f) =>
      [f.nume_reprezentant, f.prenume_reprezentant]
        .filter(Boolean)
        .join(' ') || '—',
    sortValue: (f) =>
      [f.nume_reprezentant, f.prenume_reprezentant]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
  },
  { header: 'Telefon', cell: (f) => f.telefon ?? '—', sortValue: (f) => f.telefon?.toLowerCase() },
  { header: 'Email', cell: (f) => f.email ?? '—', sortValue: (f) => f.email?.toLowerCase() },
  {
    header: 'Fișă',
    cell: (f) => (
      <ChecklistBadge rezultat={evalueazaChecklist(FAMILIE_CHECKLIST, f)} compact />
    ),
    className: 'w-20',
    sortValue: (f) => {
      const rez = evalueazaChecklist(FAMILIE_CHECKLIST, f)
      return rez.lipsaEsentiale.length * 100 + rez.lipsaRecomandate.length
    },
  },
]

export function FamiliiListPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const { role } = useAuth()

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['familii', { search, page }],
    queryFn: () => listFamilii({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Familii"
        subtitle={data ? `${data.total} familii` : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {isFrontDeskOrHigher(role) && (
              <Button variant="secondary" onClick={() => setGenOpen(true)}>
                Generează familiile lipsă
              </Button>
            )}
            <Button onClick={() => setFormOpen(true)}>+ Familie nouă</Button>
          </div>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume, reprezentant, telefon…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
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
            rowKey={(f) => f.id}
            onRowClick={(f) => navigate(`/familii/${f.id}`)}
            emptyMessage="Nicio familie găsită."
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
        <FamilieForm open onClose={() => setFormOpen(false)} />
      )}
      {genOpen && <GenereazaFamiliiModal open onClose={() => setGenOpen(false)} />}
    </div>
  )
}
