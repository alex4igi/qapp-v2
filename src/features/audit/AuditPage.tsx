import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  Select,
  Spinner,
} from '@/components/ui'
import {
  listAuditLog,
  listSezoaneForAudit,
  type AuditLogRow,
} from './api'

const ACTION_LABEL: Record<string, string> = {
  price_override: 'Override preț',
  enrollment_moved: 'Mutare curs',
  enrollment_reziliata: 'Reziliere',
  enrollment_deleted: 'Ștergere înrolare',
  incasare_modified: 'Modificare încasare',
  incasare_deleted: 'Ștergere încasare',
  lead_deleted: 'Ștergere lead',
  curs_archived: 'Arhivare curs',
  teacher_archived: 'Arhivare instructor',
  client_data_changed: 'Modificare date client',
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  manager: 'bg-amber-100 text-amber-800',
  front_desk: 'bg-emerald-100 text-emerald-800',
  teacher: 'bg-pink-100 text-pink-800',
}

const ACTION_OPTIONS = [
  { value: '', label: 'Toate acțiunile' },
  ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })),
]

const ROLE_OPTIONS = [
  { value: '', label: 'Toate rolurile' },
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'teacher', label: 'Teacher' },
]

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

// Luni-ul săptămânii (ISO YYYY-MM-DD) pentru grupare
function weekKey(iso: string): string {
  const d = new Date(iso)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

function formatWeekRange(mondayIso: string): string {
  const monday = new Date(mondayIso)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} → ${fmt(sunday)}`
}

function summarizeValues(row: AuditLogRow): string {
  if (row.action === 'price_override') {
    const o = row.old_value as { suma?: number } | null
    const n = row.new_value as { suma?: number } | null
    return `${o?.suma ?? '?'} RON → ${n?.suma ?? '?'} RON`
  }
  if (row.action === 'curs_archived' || row.action === 'teacher_archived') {
    const n = row.new_value as { suspendat?: boolean; arhivat?: boolean } | null
    const archived = n?.suspendat ?? n?.arhivat
    return archived ? 'Arhivat' : 'Dezarhivat'
  }
  if (row.action === 'incasare_deleted') {
    const o = row.old_value as { suma?: number; client?: string } | null
    return `${o?.client ?? '?'}: ${o?.suma ?? '?'} RON șters`
  }
  if (row.action === 'incasare_modified') {
    const o = row.old_value as { suma?: number } | null
    const n = row.new_value as { suma?: number } | null
    return `${o?.suma ?? '?'} RON → ${n?.suma ?? '?'} RON`
  }
  return ''
}

function AuditRow({ row }: { row: AuditLogRow }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-quasar-gray-light px-4 py-2.5 text-sm last:border-0">
      <div className="flex-1 min-w-0">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-quasar-gray">{formatDateTime(row.created)}</span>
          <span
            className={[
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
              ROLE_COLOR[row.actor_role] ?? 'bg-quasar-gray-light text-quasar-gray',
            ].join(' ')}
          >
            {row.actor_role}
          </span>
          <span className="font-medium text-quasar-black">
            {ACTION_LABEL[row.action] ?? row.action}
          </span>
          {row.locatie_nume && (
            <span className="text-xs text-quasar-gray">📍 {row.locatie_nume}</span>
          )}
        </div>
        {summarizeValues(row) && (
          <p className="text-quasar-black">{summarizeValues(row)}</p>
        )}
        {row.reason && (
          <p className="italic text-quasar-gray">„{row.reason}"</p>
        )}
      </div>
    </li>
  )
}

type WeekGroup = {
  weekIso: string
  rows: AuditLogRow[]
  countByAction: Map<string, number>
}

function WeekSection({
  group,
  isOpen,
  onToggle,
}: {
  group: WeekGroup
  isOpen: boolean
  onToggle: () => void
}) {
  const topActions = Array.from(group.countByAction.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <section className="overflow-hidden rounded-lg border border-quasar-gray-light bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-quasar-gray-light/30"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold text-quasar-black">
            Săpt. {formatWeekRange(group.weekIso)}
          </span>
          <span className="rounded-full bg-quasar-yellow/30 px-2 py-0.5 text-xs font-bold text-quasar-black">
            {group.rows.length} acțiuni
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-quasar-gray">
          {topActions.map(([action, count]) => (
            <span key={action}>
              {ACTION_LABEL[action] ?? action}: <strong>{count}</strong>
            </span>
          ))}
          <span className="text-base">{isOpen ? '▾' : '▸'}</span>
        </div>
      </button>
      {isOpen && (
        <ul className="border-t border-quasar-gray-light">
          {group.rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function AuditPage() {
  const [action, setAction] = useState('')
  const [actorRole, setActorRole] = useState('')
  const [sezonId, setSezonId] = useState('')
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())

  const sezoaneQ = useQuery({
    queryKey: ['audit', 'sezoane'],
    queryFn: listSezoaneForAudit,
  })

  const sezonOptions = useMemo(
    () => [
      { value: '', label: 'Tot istoricul' },
      ...(sezoaneQ.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.numele_sezonului} (${s.stare})`,
      })),
    ],
    [sezoaneQ.data],
  )

  const auditQ = useQuery({
    queryKey: ['audit-log', { action, actorRole, sezonId }],
    queryFn: () =>
      listAuditLog({
        action: action || null,
        actorRole: actorRole || null,
        sezonId: sezonId || null,
      }),
  })

  const groupedByWeek: WeekGroup[] = useMemo(() => {
    const map = new Map<string, AuditLogRow[]>()
    for (const row of auditQ.data ?? []) {
      const key = weekKey(row.created)
      const arr = map.get(key) ?? []
      arr.push(row)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([weekIso, rows]) => {
        const countByAction = new Map<string, number>()
        for (const r of rows) {
          countByAction.set(r.action, (countByAction.get(r.action) ?? 0) + 1)
        }
        return { weekIso, rows, countByAction }
      })
  }, [auditQ.data])

  // Default: deschide doar săptămâna curentă
  const currentWeek = groupedByWeek[0]?.weekIso ?? null
  const effectiveOpen = useMemo(() => {
    if (openWeeks.size === 0 && currentWeek) {
      return new Set([currentWeek])
    }
    return openWeeks
  }, [openWeeks, currentWeek])

  const toggleWeek = (key: string) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev.size === 0 && currentWeek ? [currentWeek] : prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const totalActions = (auditQ.data ?? []).length

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`${totalActions} acțiuni · grupate pe săptămână · click pentru detalii`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Acțiune" htmlFor="audit-action">
            <Select
              id="audit-action"
              options={ACTION_OPTIONS}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Rol actor" htmlFor="audit-role">
            <Select
              id="audit-role"
              options={ROLE_OPTIONS}
              value={actorRole}
              onChange={(e) => setActorRole(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Sezon" htmlFor="audit-sezon">
            <Select
              id="audit-sezon"
              options={sezonOptions}
              value={sezonId}
              onChange={(e) => setSezonId(e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setOpenWeeks(new Set(groupedByWeek.map((g) => g.weekIso)))}
          className="rounded-md border border-quasar-gray-light bg-white px-3 py-1.5 text-sm hover:bg-quasar-gray-light"
        >
          Deschide tot
        </button>
        <button
          type="button"
          onClick={() => setOpenWeeks(new Set())}
          className="rounded-md border border-quasar-gray-light bg-white px-3 py-1.5 text-sm hover:bg-quasar-gray-light"
        >
          Închide tot
        </button>
      </div>

      {auditQ.isLoading ? (
        <Spinner />
      ) : auditQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {humanizeError(auditQ.error)}
        </p>
      ) : groupedByWeek.length === 0 ? (
        <p className="text-sm text-quasar-gray">Nicio acțiune înregistrată.</p>
      ) : (
        <div className="space-y-2">
          {groupedByWeek.map((g) => (
            <WeekSection
              key={g.weekIso}
              group={g}
              isOpen={effectiveOpen.has(g.weekIso)}
              onToggle={() => toggleWeek(g.weekIso)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
