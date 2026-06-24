import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner, Combobox, Field } from '@/components/ui'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import { clientiOptions } from '@/lib/lookups'
import { formatRON } from '@/lib/format'
import { waLink } from '@/lib/phone'
import { EvenimentForm } from './EvenimentForm'
import {
  getEvenimentRoster,
  getEveniment,
  addEvenimentParticipant,
  removeEvenimentParticipant,
  type EvenimentRosterRow,
} from './api'

function waParticipantMessage(prenume: string | null, nume: string): string {
  const cui = prenume || nume
  return `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${cui}.`
}

function ParticipantCard({
  row,
  pretBilet,
  onPay,
  onRemove,
  removePending,
}: {
  row: EvenimentRosterRow
  pretBilet: number | null
  onPay: (clientId: string) => void
  onRemove: (row: EvenimentRosterRow) => void
  removePending: boolean
}) {
  const navigate = useNavigate()
  const name = [row.nume, row.prenume].filter(Boolean).join(', ')
  const isLead = row.kind === 'lead'
  const showPay = !isLead && (row.neplatit || row.rest > 0)
  const payLabel = row.neplatit
    ? 'Nu a plătit biletul'
    : `Rest de plată: ${formatRON(row.rest)}`
  // Scoatem din listă doar participanții adăugați manual care n-au plătit nimic
  // (cumpărătorii de bilet nu se scot — au tranzacție).
  const showRemove = row.manual && row.neplatit
  const navTarget = isLead ? '/leads' : `/clienti/${row.refId}`
  const waHref = waLink(row.telefon, waParticipantMessage(row.prenume, row.nume))

  const fullyPaid = !row.neplatit && row.rest === 0
  const bg = fullyPaid
    ? 'bg-green-100 border-green-200'
    : 'bg-amber-50 border-amber-200'

  return (
    <div
      className={['relative flex flex-col items-center rounded-lg border p-3', bg].join(' ')}
    >
      <span
        className={[
          'absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm',
          isLead ? 'bg-blue-600' : 'bg-quasar-gray',
        ].join(' ')}
      >
        {isLead ? 'Lead' : 'Cursant'}
      </span>
      <div className="mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-white">
        {row.foto ? (
          <img src={row.foto} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl text-quasar-gray">👤</span>
        )}
      </div>
      <span className="mb-1 text-center text-sm font-medium text-quasar-black">
        {name}
      </span>
      <span className="mb-2 text-center text-xs text-quasar-gray">
        {pretBilet != null
          ? row.neplatit
            ? 'Neplătit'
            : row.rest > 0
              ? `Rest ${formatRON(row.rest)}`
              : 'Plătit integral'
          : row.platit > 0
            ? `Achitat ${formatRON(row.platit)}`
            : '—'}
      </span>
      <div className="mt-auto flex items-center gap-2">
        {showPay && (
          <div className="group relative">
            <button
              type="button"
              onClick={() => onPay(row.refId)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800 shadow-sm ring-1 ring-amber-300 transition-colors hover:bg-quasar-yellow hover:text-quasar-black"
              aria-label={payLabel}
            >
              $
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-quasar-black px-2 py-1 text-xs text-white shadow-md group-hover:block"
            >
              {payLabel}
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
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-green-600 shadow-sm transition-colors hover:bg-green-50"
            aria-label="Scrie pe WhatsApp"
            title="Scrie pe WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
          </a>
        )}
        {showRemove && (
          <button
            type="button"
            onClick={() => onRemove(row)}
            disabled={removePending}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
            aria-label="Scoate din listă"
            title="Scoate din listă"
          >
            ✕
          </button>
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

export function EvenimentRosterPage() {
  const { evenimentId } = useParams<{ evenimentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canManage = isPrivileged(role)
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const rosterKey = ['eveniment-roster', evenimentId]
  const { data, isLoading, isError } = useQuery({
    queryKey: rosterKey,
    queryFn: () => getEvenimentRoster(evenimentId!),
    enabled: Boolean(evenimentId),
  })

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })

  const editQ = useQuery({
    queryKey: ['eveniment-full', evenimentId],
    queryFn: () => getEveniment(evenimentId!),
    enabled: editOpen && Boolean(evenimentId),
  })

  const invalidateRoster = () =>
    queryClient.invalidateQueries({ queryKey: rosterKey })

  const addMut = useMutation({
    mutationFn: (clientId: string) =>
      addEvenimentParticipant(evenimentId!, clientId),
    onSuccess: invalidateRoster,
  })
  const removeMut = useMutation({
    mutationFn: (clientId: string) =>
      removeEvenimentParticipant(evenimentId!, clientId),
    onSuccess: invalidateRoster,
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div>
        <p className="text-sm text-red-600">Eroare la încărcare.</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate(-1)}>
          ← Înapoi
        </Button>
      </div>
    )
  }

  const subtitle = [data.tip, data.data, data.locatia].filter(Boolean).join(' · ')
  const platitIntegral = data.roster.filter((r) => !r.neplatit && r.rest === 0).length
  const deIncasat = data.roster.filter((r) => r.neplatit || r.rest > 0).length

  // Cursanți care nu sunt deja în roster (manual sau cumpărători de bilet).
  const inRoster = new Set(
    data.roster.filter((r) => r.kind === 'client').map((r) => r.refId),
  )
  const addOptions = (clientiQ.data ?? []).filter((o) => !inRoster.has(o.value))

  return (
    <div>
      <PageHeader
        title={data.nume}
        subtitle={subtitle || undefined}
        actions={
          <div className="flex gap-2">
            {canManage && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                ✏️ Editează
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(-1)}>
              ← Înapoi
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-6 rounded-md border border-quasar-gray-light bg-white px-4 py-3">
        <Counter label="Participanți" value={data.roster.length} />
        <Counter label="Plătit integral" value={platitIntegral} />
        <Counter label="De încasat" value={deIncasat} />
      </div>

      <div className="mb-6 max-w-md">
        <Field label="Adaugă participant (înscris manual)">
          <Combobox
            placeholder="Caută cursant (nume sau telefon)…"
            options={addOptions}
            value=""
            onChange={(id) => id && addMut.mutate(id)}
            disabled={addMut.isPending}
          />
        </Field>
      </div>

      {data.roster.length === 0 ? (
        <p className="rounded-lg border border-quasar-gray-light bg-white p-6 text-center text-sm text-quasar-gray">
          Niciun participant. Adaugă cursanți manual de mai sus sau înregistrează o
          plată de bilet legată de acest eveniment.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {data.roster.map((r) => (
            <ParticipantCard
              key={`${r.kind}:${r.refId}`}
              row={r}
              pretBilet={data.pretBilet}
              onPay={(id) => setPayClientId(id)}
              onRemove={(row) => removeMut.mutate(row.refId)}
              removePending={
                removeMut.isPending && removeMut.variables === r.refId
              }
            />
          ))}
        </div>
      )}

      {payClientId && (
        <PlataNouaModal
          open
          defaultClientId={payClientId}
          defaultTip="Bilet"
          defaultBiletId={data.id}
          onClose={() => {
            setPayClientId(null)
            void invalidateRoster()
          }}
        />
      )}

      {editOpen && editQ.data && (
        <EvenimentForm
          open
          eveniment={editQ.data}
          onClose={() => {
            setEditOpen(false)
            void invalidateRoster()
            void queryClient.invalidateQueries({
              queryKey: ['eveniment-full', evenimentId],
            })
          }}
          onDeleted={() => navigate('/evenimente')}
        />
      )}
    </div>
  )
}
