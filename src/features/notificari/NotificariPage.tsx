import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner, TextArea } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateTime } from '@/lib/format'
import { isPrivileged } from '@/lib/rolesMatrix'
import {
  listNotificari,
  markAsRead,
  markAllAsRead,
  resolveNotificare,
  dispatchWeeklyAuditDigest,
  isOpenTodo,
  type Notification,
} from './api'

const ACTION_LABEL: Record<string, string> = {
  price_override: 'Override preț înrolare',
  enrollment_moved: 'Mutare înrolare alt curs',
  enrollment_reziliata: 'Reziliere înrolare',
  incasare_modified: 'Modificare încasare',
  incasare_deleted: 'Ștergere încasare',
  lead_deleted: 'Ștergere lead',
  curs_archived: 'Arhivare/dezarhivare curs',
  teacher_archived: 'Arhivare/dezarhivare instructor',
  client_data_changed: 'Modificare date client',
}

type AuditPayload = {
  since?: string
  until?: string
  total_actions?: number
  by_action?: Array<{ action: string; actor_role: string; count: number }>
}

// Ținta de navigare la click pe notificare (null = doar marchează citit).
function targetFor(n: Notification): string | null {
  if (n.kind === 'app_feedback_new') {
    const fid = (n.payload as { feedback_id?: string } | null)?.feedback_id
    return fid ? `/feedback-app?feedback=${fid}` : '/feedback-app'
  }
  if (n.kind === 'anunt_staff') {
    const aid = (n.payload as { anunt_id?: string } | null)?.anunt_id
    return aid ? `/anunturi?anunt=${aid}` : '/anunturi'
  }
  if (n.kind === 'enrollment_move' || n.kind === 'request_resolved') {
    const cid = (n.payload as { client?: string } | null)?.client
    return cid ? `/clienti/${cid}` : null
  }
  return null
}

function NotificationCard({
  n,
  onClick,
  onResolve,
  resolving,
}: {
  n: Notification
  onClick: () => void
  onResolve?: (raspuns: string) => void
  resolving?: boolean
}) {
  const [showResolve, setShowResolve] = useState(false)
  const [raspuns, setRaspuns] = useState('')
  const unread = n.read_at == null
  const isAudit = n.kind === 'audit_digest_weekly'
  const audit = isAudit ? (n.payload as AuditPayload | null) : null
  const isFeedback = n.kind === 'app_feedback_new'
  const isAnunt = n.kind === 'anunt_staff'
  const isResponse = n.kind === 'request_resolved'
  const openTodo = isOpenTodo(n)
  const resolved = n.requires_action && n.status === 'resolved'
  const hasTarget = targetFor(n) != null

  return (
    <article
      onClick={onClick}
      className={[
        'rounded-lg border bg-white p-4 transition-colors',
        hasTarget || unread ? 'cursor-pointer' : '',
        openTodo
          ? 'border-quasar-yellow-dark shadow-sm hover:bg-quasar-yellow/10'
          : unread
            ? 'border-quasar-yellow-dark shadow-sm hover:bg-quasar-yellow/10'
            : 'border-quasar-gray-light hover:bg-quasar-gray-light/40',
      ].join(' ')}
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-quasar-black">
          {unread && <span className="mr-2 text-quasar-yellow-dark">●</span>}
          {n.title}
        </h3>
        <time className="shrink-0 text-xs text-quasar-gray">
          {formatDateTime(n.created_at)}
        </time>
      </header>
      {n.body && <p className="mb-3 text-sm text-quasar-gray">{n.body}</p>}
      {isFeedback && (
        <p className="text-xs font-semibold text-quasar-yellow-dark">
          Vezi detalii și triază →
        </p>
      )}
      {isAnunt && (
        <p className="text-xs font-semibold text-quasar-yellow-dark">
          Vezi anunțul →
        </p>
      )}
      {isResponse && (
        <p className="text-xs font-semibold text-green-700">
          Răspuns de la manager{hasTarget ? ' · vezi fișa →' : ''}
        </p>
      )}
      {openTodo && (
        <div className="mt-1">
          {!showResolve ? (
            <div className="flex items-center justify-between gap-3">
              {hasTarget ? (
                <span className="text-xs font-semibold text-quasar-yellow-dark">
                  Vezi fișa →
                </span>
              ) : (
                <span />
              )}
              <Button
                variant="secondary"
                disabled={resolving}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowResolve(true)
                }}
              >
                ✓ Marchează rezolvat
              </Button>
            </div>
          ) : (
            <div
              className="space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <TextArea
                rows={2}
                value={raspuns}
                onChange={(e) => setRaspuns(e.target.value)}
                placeholder="Notă opțională pentru inițiator (ex: confirmat, revino la grupa veche)…"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={resolving}
                  onClick={() => {
                    setShowResolve(false)
                    setRaspuns('')
                  }}
                >
                  Anulează
                </Button>
                <Button
                  disabled={resolving}
                  onClick={() => onResolve?.(raspuns)}
                >
                  {resolving ? '…' : 'Trimite & rezolvă'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {resolved && (
        <p className="mt-1 text-xs font-medium text-green-700">
          ✓ Rezolvat {n.resolved_at ? `· ${formatDateTime(n.resolved_at)}` : ''}
        </p>
      )}
      {audit && audit.by_action && audit.by_action.length > 0 && (
        <div className="rounded-md bg-quasar-gray-light/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
            Detalii ({formatDate(audit.since)} → {formatDate(audit.until)})
          </p>
          <ul className="space-y-1 text-sm">
            {audit.by_action.map((row, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  {ACTION_LABEL[row.action] ?? row.action}{' '}
                  <span className="text-quasar-gray">({row.actor_role})</span>
                </span>
                <strong className="text-quasar-black">{row.count}×</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

type Tab = 'todo' | 'all'

export function NotificariPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { role } = useAuth()
  const canDigest = isPrivileged(role)
  const [tab, setTab] = useState<Tab>('todo')

  const notificariQ = useQuery({
    queryKey: ['notificari'],
    queryFn: listNotificari,
  })

  const all = notificariQ.data ?? []
  const todos = useMemo(() => all.filter(isOpenTodo), [all])
  const unreadCount = useMemo(
    () => all.filter((n) => n.read_at == null).length,
    [all],
  )

  // Dacă nu există to-do-uri, deschidem direct pe „Toate".
  const effectiveTab: Tab = tab === 'todo' && todos.length === 0 ? 'all' : tab
  const visible = effectiveTab === 'todo' ? todos : all

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notificari'] })
    void queryClient.invalidateQueries({ queryKey: ['notificari-unread'] })
  }

  const readOne = useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: invalidate,
  })

  const readAll = useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: invalidate,
  })

  const resolve = useMutation({
    mutationFn: (v: { id: string; raspuns: string }) =>
      resolveNotificare(v.id, v.raspuns),
    onSuccess: invalidate,
  })

  const triggerDigest = useMutation({
    mutationFn: () => dispatchWeeklyAuditDigest(),
    onSuccess: invalidate,
  })

  const tabBtn = (t: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(t)}
      className={[
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        effectiveTab === t
          ? 'bg-quasar-black text-white'
          : 'bg-quasar-gray-light/60 text-quasar-black hover:bg-quasar-gray-light',
      ].join(' ')}
    >
      {label}
      {count > 0 && (
        <span
          className={[
            'ml-2 rounded-full px-1.5 text-xs font-bold',
            t === 'todo'
              ? 'bg-red-600 text-white'
              : 'bg-quasar-gray-light text-quasar-black',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div>
      <PageHeader
        title="Notificări"
        subtitle={
          todos.length > 0
            ? `${todos.length} de făcut`
            : unreadCount > 0
              ? `${unreadCount} ne-citite`
              : 'Toate citite'
        }
        actions={
          <div className="flex gap-2">
            {canDigest && (
              <Button
                variant="secondary"
                onClick={() => triggerDigest.mutate()}
                disabled={triggerDigest.isPending}
                title="Forțează generarea digest-ului săptămânal (debug)"
              >
                {triggerDigest.isPending ? '…' : '↻ Generează digest acum'}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                onClick={() => readAll.mutate()}
                disabled={readAll.isPending}
              >
                Marchează toate ca citite
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex gap-2">
        {tabBtn('todo', 'De făcut', todos.length)}
        {tabBtn('all', 'Toate', all.length)}
      </div>

      {notificariQ.isLoading ? (
        <Spinner />
      ) : notificariQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {humanizeError(notificariQ.error)}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-quasar-gray">
          {effectiveTab === 'todo'
            ? 'Nimic de făcut — toate rezolvate.'
            : 'Nicio notificare încă.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((n) => (
            <NotificationCard
              key={n.id}
              n={n}
              resolving={resolve.isPending && resolve.variables?.id === n.id}
              onResolve={
                isOpenTodo(n)
                  ? (raspuns: string) => resolve.mutate({ id: n.id, raspuns })
                  : undefined
              }
              onClick={() => {
                if (n.read_at == null) readOne.mutate(n.id)
                const target = targetFor(n)
                if (target) navigate(target)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
