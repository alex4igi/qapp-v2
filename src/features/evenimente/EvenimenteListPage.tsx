import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Select,
  Field,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { tipEvenimentOptions } from '@/lib/enums'
import { isPrivileged } from '@/lib/rolesMatrix'
import { EvenimentForm } from './EvenimentForm'
import {
  listEvenimente,
  listEvenimenteAni,
  PAGE_SIZE,
  type EvenimentCuGrupa,
} from './api'

type Temporal = 'all' | 'viitoare' | 'trecute'
const TEMPORAL_TABS: { key: Temporal; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'viitoare', label: 'Viitoare' },
  { key: 'trecute', label: 'Trecute' },
]

const columns: Column<EvenimentCuGrupa>[] = [
  {
    header: 'Eveniment',
    cell: (e) => <span className="font-medium">{e.nume_eveniment}</span>,
    sortValue: (e) => e.nume_eveniment?.toLowerCase(),
  },
  {
    header: 'Tip',
    // Cele 16 clase demo migrate din campania Back to Dance School n-au încă
    // sală/capacitate — câmpuri care nu existau când au fost create. Badge-ul e
    // reminderul de completare; rândul rămâne perfect funcțional fără ele.
    cell: (e) => (
      <span className="flex items-center gap-1.5">
        {e.tip ?? '—'}
        {e.tip === 'DEMO Class' && (!e.sala || e.capacitate == null) && (
          <span
            title="Completează sala și capacitatea"
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800"
          >
            ⚠ incomplet
          </span>
        )}
      </span>
    ),
    className: 'w-44',
    sortValue: (e) => e.tip?.toLowerCase(),
  },
  {
    header: 'Data',
    cell: (e) => e.data ?? '—',
    className: 'w-32',
    sortValue: (e) => e.data,
  },
  {
    header: 'Ora',
    cell: (e) => e.ora?.slice(0, 5) ?? '—',
    className: 'w-20',
    sortValue: (e) => e.ora,
  },
  {
    header: 'Grupă',
    cell: (e) => e.curs_rel?.numele ?? '—',
    sortValue: (e) => e.curs_rel?.numele?.toLowerCase(),
  },
  {
    header: 'Locație',
    cell: (e) => e.locatia ?? '—',
    sortValue: (e) => e.locatia?.toLowerCase(),
  },
  {
    header: 'Status',
    cell: (e) => e.status ?? '—',
    className: 'w-28',
    sortValue: (e) => e.status?.toLowerCase(),
  },
  {
    header: 'Portal',
    cell: (e) =>
      e.public ? (
        <span title="Bilet afișat pe portalul de membri">🌐</span>
      ) : (
        '—'
      ),
    className: 'w-20 text-center',
  },
]

export function EvenimenteListPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const canManage = isPrivileged(role)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [an, setAn] = useState('')
  const [tip, setTip] = useState('')
  const [temporal, setTemporal] = useState<Temporal>('all')
  const [formOpen, setFormOpen] = useState(false)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const aniQ = useQuery({
    queryKey: ['evenimente', 'ani'],
    queryFn: listEvenimenteAni,
  })
  const aniOptions = useMemo(
    () => (aniQ.data ?? []).map((y) => ({ value: String(y), label: String(y) })),
    [aniQ.data],
  )

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evenimente', { search, page, an, tip, temporal }],
    queryFn: () =>
      listEvenimente({
        search,
        page,
        an: an ? Number(an) : null,
        tip: tip || null,
        temporal,
        today,
      }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Evenimente"
        subtitle={data ? `${data.total} evenimente` : undefined}
        actions={
          canManage ? (
            <Button onClick={() => setFormOpen(true)}>+ Eveniment nou</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Caută" htmlFor="ev-search">
            <TextInput
              id="ev-search"
              placeholder="Caută după nume sau locație…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="An" htmlFor="ev-an">
            <Select
              id="ev-an"
              placeholder="Toți anii"
              options={aniOptions}
              value={an}
              onChange={(e) => {
                setAn(e.target.value)
                setPage(0)
              }}
            />
          </Field>
          <Field label="Tip" htmlFor="ev-tip">
            <Select
              id="ev-tip"
              placeholder="Toate tipurile"
              options={tipEvenimentOptions}
              value={tip}
              onChange={(e) => {
                setTip(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="flex gap-1">
          {TEMPORAL_TABS.map((t) => (
            <Button
              key={t.key}
              variant={temporal === t.key ? 'primary' : 'secondary'}
              onClick={() => {
                setTemporal(t.key)
                setPage(0)
              }}
            >
              {t.label}
            </Button>
          ))}
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
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(e) => e.id}
            onRowClick={(e) => navigate(`/eveniment/${e.id}`)}
            emptyMessage="Niciun eveniment."
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

      {formOpen && <EvenimentForm open onClose={() => setFormOpen(false)} />}
    </div>
  )
}
