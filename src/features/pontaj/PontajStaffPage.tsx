import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  DateInput,
  MonthPicker,
  Spinner,
  DataTable,
  Button,
  Badge,
  Tabs,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatTime } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { listUsers } from '@/features/setari/utilizatoriApi'
import { PontajCorectieModal } from './PontajCorectieModal'
import {
  listPontaj,
  listNeconfirmate,
  confirmaTura,
  sumarLuna,
  aprobaLuna,
  deblocheazaLuna,
  type PontajRow,
  type PontajStatus,
} from './api'

function durataText(minute: number | null): string {
  if (minute == null) return '—'
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const STATUS_LABEL: Record<PontajStatus, string> = {
  ok: 'OK',
  necesita_confirmare: 'De confirmat',
  corectat: 'Corectat',
  legacy: 'Istoric (auth)',
}

const STATUS_TONE: Record<PontajStatus, BadgeTone> = {
  ok: 'success',
  necesita_confirmare: 'warn',
  corectat: 'brand',
  legacy: 'neutral',
}

function lunaCurenta(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function PontajStaffPage() {
  const { role } = useAuth()
  const poateAproba = isAdminOrHigher(role)
  const qc = useQueryClient()

  const [tab, setTab] = useState('ture')
  const [modal, setModal] = useState<{ tura: PontajRow | null } | null>(null)

  const usersQ = useQuery({ queryKey: ['utilizatori'], queryFn: listUsers })
  const userById = useMemo(() => {
    const map = new Map<string, { email: string | null; role: string }>()
    for (const u of usersQ.data ?? []) map.set(u.id, { email: u.email, role: u.role })
    return map
  }, [usersQ.data])

  const numeUser = (id: string) => userById.get(id)?.email ?? id.slice(0, 8)

  return (
    <div>
      <PageHeader
        title="Pontaj staff"
        subtitle="Orele pontate sugerează salariul — nu îl stabilesc. Verifică turele de confirmat înainte de a aproba luna."
      />

      <Tabs
        tabs={[
          { id: 'ture', label: 'Ture' },
          { id: 'confirmare', label: 'De confirmat' },
          { id: 'luna', label: 'Închidere lună' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'ture' && (
        <TabTure
          userById={userById}
          numeUser={numeUser}
          loadingUsers={usersQ.isLoading}
          onEdit={(tura) => setModal({ tura })}
        />
      )}

      {tab === 'confirmare' && (
        <TabConfirmare numeUser={numeUser} onEdit={(tura) => setModal({ tura })} />
      )}

      {tab === 'luna' && <TabLuna numeUser={numeUser} poateAproba={poateAproba} />}

      <PontajCorectieModal
        open={modal !== null}
        tura={modal?.tura ?? null}
        utilizatorLabel={modal?.tura ? numeUser(modal.tura.user_id) : undefined}
        onClose={() => {
          setModal(null)
          void qc.invalidateQueries({ queryKey: ['pontaj'] })
        }}
      />
    </div>
  )
}

/* ---------- Tab: toate turele ---------- */

function TabTure({
  userById,
  numeUser,
  loadingUsers,
  onEdit,
}: {
  userById: Map<string, { email: string | null; role: string }>
  numeUser: (id: string) => string
  loadingUsers: boolean
  onEdit: (t: PontajRow) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)

  const pontajQ = useQuery({
    queryKey: ['pontaj', from, to],
    queryFn: () => listPontaj({ from, to }),
  })

  const rows = pontajQ.data ?? []

  const columns: Column<PontajRow>[] = [
    {
      header: 'Data',
      cell: (r) => formatDate(r.start_at),
      className: 'w-28',
      sortValue: (r) => r.start_at,
    },
    {
      header: 'Utilizator',
      cell: (r) => {
        const u = userById.get(r.user_id)
        return (
          <div>
            <div className="font-medium text-quasar-black">{numeUser(r.user_id)}</div>
            {u?.role && <div className="text-xs text-quasar-gray">{u.role}</div>}
          </div>
        )
      },
      sortValue: (r) => numeUser(r.user_id).toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (r) => r.locatie_nume ?? '—',
      className: 'w-40',
      sortValue: (r) => r.locatie_nume?.toLowerCase(),
    },
    {
      header: 'Start',
      cell: (r) => formatTime(r.start_at),
      className: 'w-20',
      sortValue: (r) => r.start_at,
    },
    {
      header: 'Sfârșit',
      cell: (r) => (r.end_at ? formatTime(r.end_at) : '…'),
      className: 'w-20',
      sortValue: (r) => r.end_at,
    },
    {
      header: 'Plătibil',
      cell: (r) => (
        <span className={r.end_at ? '' : 'text-amber-700'}>
          {r.end_at ? durataText(r.minute_platibile) : '(deschisă)'}
        </span>
      ),
      className: 'w-28',
      sortValue: (r) => r.minute_platibile,
    },
    {
      header: 'Stare',
      cell: (r) => (
        <div>
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          {r.nota && (
            <div
              className="mt-0.5 max-w-[16rem] truncate text-xs text-quasar-gray"
              title={r.nota}
            >
              {r.nota}
            </div>
          )}
        </div>
      ),
      className: 'w-44',
      sortValue: (r) => r.status,
    },
    {
      header: '',
      cell: (r) => (
        <Button variant="secondary" onClick={() => onEdit(r)}>
          Corectează
        </Button>
      ),
      className: 'w-32',
    },
  ]

  const totalMinute = rows.reduce((s, r) => s + (r.minute_platibile ?? 0), 0)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field label="De la" htmlFor="pontaj-from">
            <DateInput
              id="pontaj-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Până la" htmlFor="pontaj-to">
            <DateInput id="pontaj-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!rows.length}
          onClick={() => {
            downloadCsv(
              `pontaj-${from}_${to}.csv`,
              [
                'Data',
                'Utilizator',
                'Locație',
                'Start',
                'Sfârșit',
                'Minute plătibile',
                'Stare',
                'Notă',
              ],
              rows.map((r) => [
                formatDate(r.start_at),
                numeUser(r.user_id),
                r.locatie_nume ?? '',
                r.start_at,
                r.end_at ?? '',
                String(r.minute_platibile ?? ''),
                STATUS_LABEL[r.status],
                r.nota ?? '',
              ]),
            )
          }}
        >
          ⬇ Export CSV
        </Button>
        <div className="ml-auto text-sm text-quasar-gray">
          {rows.length} ture · total plătibil{' '}
          <span className="font-semibold text-ink">{durataText(totalMinute)}</span>
        </div>
      </div>

      {pontajQ.isLoading || loadingUsers ? (
        <Spinner />
      ) : pontajQ.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(pontajQ.error)}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="Nicio tură în perioada selectată."
        />
      )}
    </>
  )
}

/* ---------- Tab: worklist de confirmat ---------- */

function TabConfirmare({
  numeUser,
  onEdit,
}: {
  numeUser: (id: string) => string
  onEdit: (t: PontajRow) => void
}) {
  const qc = useQueryClient()
  const [eroare, setEroare] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['pontaj-neconfirmate'], queryFn: listNeconfirmate })

  const confirma = useMutation({
    mutationFn: confirmaTura,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pontaj-neconfirmate'] })
      void qc.invalidateQueries({ queryKey: ['pontaj'] })
    },
    onError: (e) => setEroare(humanizeError(e)),
  })

  const rows = q.data ?? []

  if (q.isLoading) return <Spinner />
  if (q.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(q.error)}</p>

  return (
    <>
      <p className="mb-4 text-sm text-quasar-gray">
        Ture închise automat pentru că nu s-a pontat ieșirea — închise la ora de
        închidere a locației. Confirmă-le dacă ora e corectă, altfel corectează-le.
        Luna nu poate fi aprobată cât timp au rămas ture aici.
      </p>

      {eroare && <p className="mb-3 text-sm text-red-600">{eroare}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-6 text-center text-sm text-quasar-gray">
          Nimic de confirmat. 🎉
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-quasar-black">
                  {numeUser(r.user_id)}
                </div>
                <div className="text-sm text-quasar-gray">
                  {formatDate(r.start_at)} · {formatTime(r.start_at)} –{' '}
                  {r.end_at ? formatTime(r.end_at) : '…'} · {r.locatie_nume ?? '—'} ·{' '}
                  <span className="font-medium text-ink">
                    {durataText(r.minute_platibile)}
                  </span>
                </div>
              </div>
              <Button variant="secondary" onClick={() => onEdit(r)}>
                Corectează
              </Button>
              <Button
                disabled={confirma.isPending}
                onClick={() => {
                  setEroare(null)
                  confirma.mutate(r.id)
                }}
              >
                Confirmă
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- Tab: închiderea lunii ---------- */

function TabLuna({
  numeUser,
  poateAproba,
}: {
  numeUser: (id: string) => string
  poateAproba: boolean
}) {
  const qc = useQueryClient()
  const [luna, setLuna] = useState(lunaCurenta)
  const [eroare, setEroare] = useState<string | null>(null)

  const primaZi = `${luna}-01`

  const q = useQuery({
    queryKey: ['pontaj-sumar', primaZi],
    queryFn: () => sumarLuna(primaZi),
  })

  const invalideaza = () => {
    void qc.invalidateQueries({ queryKey: ['pontaj-sumar'] })
    void qc.invalidateQueries({ queryKey: ['pontaj'] })
  }

  const aproba = useMutation({
    mutationFn: (userId: string) => aprobaLuna(userId, primaZi),
    onSuccess: invalideaza,
    onError: (e) => setEroare(humanizeError(e)),
  })

  const deblocheaza = useMutation({
    mutationFn: (userId: string) => {
      const motiv = window.prompt('Motivul deblocării lunii:')?.trim()
      if (!motiv) throw new Error('Motivul deblocării e obligatoriu.')
      return deblocheazaLuna(userId, primaZi, motiv)
    },
    onSuccess: invalideaza,
    onError: (e) => setEroare(humanizeError(e)),
  })

  const rows = q.data ?? []

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Field label="Luna" htmlFor="pontaj-luna">
            <MonthPicker id="pontaj-luna" value={luna} onChange={setLuna} />
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!rows.length}
          onClick={() => {
            downloadCsv(
              `pontaj-luna-${luna}.csv`,
              [
                'Utilizator',
                'Ore',
                'Minute',
                'Ture',
                'De confirmat',
                'Deschise',
                'Aprobat',
              ],
              rows.map((r) => [
                numeUser(r.user_id),
                (r.total_minute / 60).toFixed(2),
                String(r.total_minute),
                String(r.nr_ture),
                String(r.nr_neconfirmate),
                String(r.nr_deschise),
                r.aprobat ? 'da' : 'nu',
              ]),
            )
          }}
        >
          ⬇ Export CSV
        </Button>
      </div>

      {!poateAproba && (
        <p className="mb-3 text-sm text-quasar-gray">
          Doar owner/admin pot aproba luna. Tu poți vedea totalurile și corecta turele.
        </p>
      )}

      {eroare && <p className="mb-3 text-sm text-red-600">{eroare}</p>}

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(q.error)}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-6 text-center text-sm text-quasar-gray">
          Nicio tură în luna aleasă.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const blocanti = r.nr_neconfirmate + r.nr_deschise
            return (
              <div
                key={r.user_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-quasar-black">
                    {numeUser(r.user_id)}
                  </div>
                  <div className="text-sm text-quasar-gray">
                    {r.nr_ture} ture ·{' '}
                    <span className="font-semibold text-ink">
                      {durataText(r.total_minute)}
                    </span>
                    {blocanti > 0 && (
                      <span className="text-amber-700">
                        {' '}
                        · {r.nr_neconfirmate} de confirmat, {r.nr_deschise} deschise
                      </span>
                    )}
                  </div>
                </div>

                {r.aprobat ? (
                  <>
                    <Badge tone="success">Aprobat</Badge>
                    {poateAproba && (
                      <Button
                        variant="secondary"
                        disabled={deblocheaza.isPending}
                        onClick={() => {
                          setEroare(null)
                          deblocheaza.mutate(r.user_id)
                        }}
                      >
                        Deblochează
                      </Button>
                    )}
                  </>
                ) : (
                  poateAproba && (
                    <Button
                      disabled={aproba.isPending || blocanti > 0}
                      title={
                        blocanti > 0
                          ? 'Rezolvă întâi turele deschise / de confirmat'
                          : undefined
                      }
                      onClick={() => {
                        setEroare(null)
                        aproba.mutate(r.user_id)
                      }}
                    >
                      Aprobă luna
                    </Button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
