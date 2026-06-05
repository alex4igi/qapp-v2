import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  TextInput,
  Spinner,
  DataTable,
  Button,
  type Column,
} from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { listUsers } from '@/features/setari/utilizatoriApi'
import { listPontaj, type PontajRow } from './api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '… (deschisă)'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 0) return '?'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const SOURCE_LABEL: Record<string, string> = {
  login: 'auto (login)',
  signout: 'sign-out',
  manual: 'încheiat manual',
  auto_midnight: 'auto 00:00',
}

const SOURCE_COLOR: Record<string, string> = {
  manual: 'text-emerald-700',
  signout: 'text-quasar-black',
  auto_midnight: 'text-amber-700',
}

export function PontajStaffPage() {
  // default: ultimele 7 zile
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(today)

  const usersQ = useQuery({ queryKey: ['utilizatori'], queryFn: listUsers })
  const pontajQ = useQuery({
    queryKey: ['pontaj', from, to],
    queryFn: () => listPontaj({ from, to }),
  })

  const userById = useMemo(() => {
    const map = new Map<string, { email: string | null; role: string }>()
    for (const u of usersQ.data ?? []) {
      map.set(u.id, { email: u.email, role: u.role })
    }
    return map
  }, [usersQ.data])

  const columns: Column<PontajRow>[] = [
    {
      header: 'Data',
      cell: (r) => formatDate(r.start_at),
      className: 'w-28',
    },
    {
      header: 'Utilizator',
      cell: (r) => {
        const u = userById.get(r.user_id)
        return (
          <div>
            <div className="font-medium text-quasar-black">
              {u?.email ?? r.user_id.slice(0, 8)}
            </div>
            {u?.role && (
              <div className="text-xs text-quasar-gray">{u.role}</div>
            )}
          </div>
        )
      },
    },
    {
      header: 'Locație',
      cell: (r) => r.locatie_nume ?? '—',
      className: 'w-40',
    },
    {
      header: 'Start',
      cell: (r) => formatTime(r.start_at),
      className: 'w-20',
    },
    {
      header: 'Sfârșit',
      cell: (r) => formatTime(r.end_at),
      className: 'w-20',
    },
    {
      header: 'Durată',
      cell: (r) => (
        <span className={r.end_at ? '' : 'text-amber-700'}>
          {formatDuration(r.start_at, r.end_at)}
        </span>
      ),
      className: 'w-28',
    },
    {
      header: 'Tip',
      cell: (r) => (
        <span className={SOURCE_COLOR[r.source ?? ''] ?? 'text-quasar-gray'}>
          {SOURCE_LABEL[r.source ?? ''] ?? r.source ?? '—'}
        </span>
      ),
      className: 'w-32',
    },
  ]

  const rows = pontajQ.data ?? []
  const totalCompleted = rows.filter((r) => r.end_at).length
  const totalOpen = rows.filter((r) => !r.end_at).length

  return (
    <div>
      <PageHeader
        title="Pontaj staff"
        subtitle={`${rows.length} sesiuni · ${totalCompleted} încheiate · ${totalOpen} deschise`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field label="De la" htmlFor="pontaj-from">
            <TextInput
              id="pontaj-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Până la" htmlFor="pontaj-to">
            <TextInput
              id="pontaj-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!rows.length}
          onClick={() => {
            downloadCsv(
              `pontaj-${from}_${to}.csv`,
              ['Data', 'Utilizator', 'Rol', 'Locație', 'Start', 'Sfârșit', 'Durată', 'Tip'],
              rows.map((r) => {
                const u = userById.get(r.user_id)
                return [
                  formatDate(r.start_at),
                  u?.email ?? r.user_id,
                  u?.role ?? '',
                  r.locatie_nume ?? '',
                  r.start_at,
                  r.end_at ?? '',
                  formatDuration(r.start_at, r.end_at),
                  SOURCE_LABEL[r.source ?? ''] ?? r.source ?? '',
                ]
              }),
            )
          }}
        >
          ⬇ Export CSV
        </Button>
      </div>

      {pontajQ.isLoading || usersQ.isLoading ? (
        <Spinner />
      ) : pontajQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare: {pontajQ.error instanceof Error ? pontajQ.error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="Nicio sesiune în perioada selectată."
        />
      )}
    </div>
  )
}
