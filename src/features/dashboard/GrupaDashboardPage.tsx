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
import { waLink } from '@/lib/phone'
import {
  getGrupaDashboard,
  type RosterStatus,
  type GrupaRosterRow,
} from './api'

// Mesaj pre-completat pentru WhatsApp către părintele cursantului.
function waParinteMessage(prenume: string): string {
  return `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${prenume}.`
}

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
  // Contact părinte pe WhatsApp — doar cursanți cu telefon mobil valid.
  const waHref = isLead
    ? null
    : waLink(row.telefon, waParinteMessage(row.prenume || row.nume))

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
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-green-600 shadow-sm transition-colors hover:bg-green-50"
            aria-label="Scrie părintelui pe WhatsApp"
            title="Scrie părintelui pe WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
          </a>
        )}
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
