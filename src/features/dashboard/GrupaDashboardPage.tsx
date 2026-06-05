import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner } from '@/components/ui'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { upsertPrezenta } from '@/features/prezente/api'
import { updateLeadStatus } from '@/features/leads/api'
import { formatRON } from '@/lib/format'
import {
  getGrupaDashboard,
  type RosterStatus,
  type GrupaRosterRow,
} from './api'

const STATUS_BG: Record<RosterStatus, string> = {
  prezent: 'bg-green-200 border-green-300',
  absent: 'bg-red-200 border-red-300',
  programat: 'bg-amber-50 border-amber-200',
  inactiv: 'bg-quasar-gray-light border-quasar-gray-light',
}

const STATUS_TEXT: Record<RosterStatus, string> = {
  prezent: 'text-green-900',
  absent: 'text-red-900',
  programat: 'text-quasar-black',
  inactiv: 'text-quasar-gray',
}

function ClientCard({
  row,
  onPay,
  onTogglePrezenta,
  onReactivateRecurent,
  onReactivateFacultativ,
  togglePending,
  facultativ,
}: {
  row: GrupaRosterRow
  onPay: (clientId: string) => void
  onTogglePrezenta: (row: GrupaRosterRow) => void
  onReactivateRecurent: (row: GrupaRosterRow) => void
  onReactivateFacultativ: (row: GrupaRosterRow) => void
  togglePending: boolean
  facultativ: boolean
}) {
  const navigate = useNavigate()
  const name = [row.nume, row.prenume].filter(Boolean).join(', ')
  const isLead = row.kind === 'lead'
  const showPay = !isLead && row.status !== 'inactiv' && row.restanta > 0
  // Reactivarea „inactiv" se aplică doar cursanților — leads nu pot fi „inactivi"
  const isInactiv = !isLead && row.status === 'inactiv'
  const nextLabel = isInactiv
    ? facultativ
      ? 'Înrolare nouă'
      : 'Reactivează'
    : row.status === 'prezent'
      ? 'Marchează absent'
      : 'Marchează prezent'
  const handlePhotoClick = () => {
    if (isInactiv) {
      if (facultativ) onReactivateFacultativ(row)
      else onReactivateRecurent(row)
    } else {
      onTogglePrezenta(row)
    }
  }
  const navTarget = isLead ? '/leads' : `/clienti/${row.refId}`

  return (
    <div
      className={[
        'relative flex flex-col items-center rounded-lg border p-3',
        STATUS_BG[row.status],
      ].join(' ')}
    >
      {isLead && (
        <span className="absolute right-1.5 top-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
          Lead
        </span>
      )}
      <button
        type="button"
        onClick={handlePhotoClick}
        disabled={togglePending}
        className="mb-2 flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-white transition-shadow hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={nextLabel}
        title={nextLabel}
      >
        {row.poza ? (
          <img
            src={row.poza}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-3xl text-quasar-gray">👤</span>
        )}
      </button>
      <span
        className={[
          'mb-2 text-center text-sm font-medium',
          STATUS_TEXT[row.status],
        ].join(' ')}
      >
        {name}
      </span>
      <div className="mt-auto flex items-center gap-2">
        {row.esteZiua && (
          <div className="group relative">
            <span
              className="flex h-7 w-7 cursor-default items-center justify-center rounded-full bg-quasar-yellow text-sm shadow-sm ring-1 ring-amber-300"
              aria-label="Aniversare azi"
            >
              🎂
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-quasar-black px-2 py-1 text-xs text-white shadow-md group-hover:block"
            >
              La mulți ani!
            </span>
          </div>
        )}
        {showPay && (
          <div className="group relative">
            <button
              type="button"
              onClick={() => onPay(row.refId)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700 shadow-sm ring-1 ring-red-300 transition-colors hover:bg-quasar-yellow hover:text-quasar-black"
              aria-label={`Restanță ${formatRON(row.restanta)}`}
            >
              $
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-quasar-black px-2 py-1 text-xs text-white shadow-md group-hover:block"
            >
              Restanță: {formatRON(row.restanta)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate(navTarget)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow-sm transition-colors hover:bg-quasar-gray-light"
          aria-label={isLead ? 'Vezi în pipeline leads' : 'Profil cursant'}
          title={isLead ? 'Vezi în pipeline leads' : 'Profil cursant'}
        >
          👤
        </button>
      </div>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="font-medium uppercase tracking-wide text-quasar-gray">
        {label}
      </span>
      <span className="text-base font-bold text-quasar-black">{value}</span>
    </span>
  )
}

export function GrupaDashboardPage() {
  const { cursId } = useParams<{ cursId: string }>()
  const navigate = useNavigate()
  const { date } = useWorkingDate()
  const queryClient = useQueryClient()
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [enrollClientId, setEnrollClientId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['grupa-dashboard', cursId, date],
    queryFn: () => getGrupaDashboard({ cursId: cursId!, date }),
    enabled: Boolean(cursId),
  })

  // Ordine stabilă: fixăm pozițiile cardurilor la primul fetch pentru această
  // combinație curs+zi, ca toggle Prezent↔Absent să nu re-sorteze grila.
  // Reset la schimbare de curs/zi.
  const [stableOrder, setStableOrder] = useState<string[] | null>(null)
  useEffect(() => {
    setStableOrder(null)
  }, [cursId, date])
  useEffect(() => {
    if (data && stableOrder === null) {
      setStableOrder(data.roster.map((r) => r.rowId))
    }
  }, [data, stableOrder])

  const orderedRoster = useMemo(() => {
    if (!data) return []
    if (!stableOrder) return data.roster
    const byId = new Map(data.roster.map((r) => [r.rowId, r]))
    const ordered = stableOrder
      .map((id) => byId.get(id))
      .filter((r): r is GrupaRosterRow => Boolean(r))
    const seen = new Set(stableOrder)
    for (const r of data.roster) {
      if (!seen.has(r.rowId)) ordered.push(r)
    }
    return ordered
  }, [data, stableOrder])

  const toggleMut = useMutation({
    mutationFn: async (row: GrupaRosterRow) => {
      if (row.kind === 'lead') {
        const newStatus = row.status === 'prezent' ? 'nu_a_venit' : 'a_venit'
        await updateLeadStatus(row.refId, newStatus)
      } else {
        await upsertPrezenta({
          enrollmentId: row.enrollmentId!,
          clientId: row.refId,
          data: date,
          status: row.status === 'prezent' ? 'Absent' : 'Prezent',
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['grupa-dashboard', cursId, date],
      })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div>
        <p className="text-sm text-red-600">Eroare la încărcare.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate(-1)}
        >
          ← Înapoi
        </Button>
      </div>
    )
  }

  const subtitle = [data.ora, data.teacher, data.sala]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <PageHeader
        title={data.cursNume}
        subtitle={subtitle || undefined}
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            ← Înapoi
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-6 rounded-md border border-quasar-gray-light bg-white px-4 py-3">
        <Counter label="Prezenți" value={data.counters.prezenti} />
        <Counter label="Absenți" value={data.counters.absenti} />
        <Counter label="Inactivi" value={data.counters.inactivi} />
        <Counter label="Programați" value={data.counters.programati} />
      </div>

      {data.roster.length === 0 ? (
        <p className="rounded-lg border border-quasar-gray-light bg-white p-6 text-center text-sm text-quasar-gray">
          Niciun cursant sau lead în roster.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {orderedRoster.map((r) => (
            <ClientCard
              key={r.rowId}
              row={r}
              facultativ={data.facultativ}
              onPay={(id) => setPayClientId(id)}
              onTogglePrezenta={(row) => toggleMut.mutate(row)}
              onReactivateRecurent={(row) => {
                const name = [row.nume, row.prenume]
                  .filter(Boolean)
                  .join(' ')
                if (
                  window.confirm(
                    `${name} revine la grupă? Va fi marcat Prezent azi.`,
                  )
                ) {
                  toggleMut.mutate(row)
                }
              }}
              onReactivateFacultativ={(row) => setEnrollClientId(row.refId)}
              togglePending={
                toggleMut.isPending && toggleMut.variables?.rowId === r.rowId
              }
            />
          ))}
        </div>
      )}

      {payClientId && (
        <PlataNouaModal
          open
          defaultClientId={payClientId}
          onClose={() => setPayClientId(null)}
        />
      )}
      {enrollClientId && (
        <EnrollmentForm
          open
          defaultClientId={enrollClientId}
          defaultCursId={cursId}
          onClose={() => {
            setEnrollClientId(null)
            void queryClient.invalidateQueries({
              queryKey: ['grupa-dashboard', cursId, date],
            })
          }}
        />
      )}
    </div>
  )
}
