import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner } from '@/components/ui'
import {
  listNotificari,
  markAsRead,
  markAllAsRead,
  dispatchWeeklyAuditDigest,
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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ro-RO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatDateOnly(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', { dateStyle: 'short' })
}

function NotificationCard({
  n,
  onClick,
}: {
  n: Notification
  onClick: () => void
}) {
  const unread = n.read_at == null
  const isAudit = n.kind === 'audit_digest_weekly'
  const audit = isAudit ? (n.payload as AuditPayload | null) : null

  return (
    <article
      onClick={onClick}
      className={[
        'cursor-pointer rounded-lg border bg-white p-4 transition-colors',
        unread
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
          {formatDate(n.created_at)}
        </time>
      </header>
      {n.body && <p className="mb-3 text-sm text-quasar-gray">{n.body}</p>}
      {audit && audit.by_action && audit.by_action.length > 0 && (
        <div className="rounded-md bg-quasar-gray-light/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
            Detalii ({formatDateOnly(audit.since)} → {formatDateOnly(audit.until)})
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

export function NotificariPage() {
  const queryClient = useQueryClient()
  const notificariQ = useQuery({
    queryKey: ['notificari'],
    queryFn: listNotificari,
  })

  const unreadCount = useMemo(
    () => (notificariQ.data ?? []).filter((n) => n.read_at == null).length,
    [notificariQ.data],
  )

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

  const triggerDigest = useMutation({
    mutationFn: () => dispatchWeeklyAuditDigest(),
    onSuccess: invalidate,
  })

  return (
    <div>
      <PageHeader
        title="Notificări"
        subtitle={
          unreadCount > 0 ? `${unreadCount} ne-citite` : 'Toate citite'
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => triggerDigest.mutate()}
              disabled={triggerDigest.isPending}
              title="Forțează generarea digest-ului săptămânal (debug)"
            >
              {triggerDigest.isPending ? '…' : '↻ Generează digest acum'}
            </Button>
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

      {notificariQ.isLoading ? (
        <Spinner />
      ) : notificariQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {notificariQ.error instanceof Error ? notificariQ.error.message : ''}
        </p>
      ) : (notificariQ.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">Nicio notificare încă.</p>
      ) : (
        <div className="space-y-3">
          {notificariQ.data!.map((n) => (
            <NotificationCard
              key={n.id}
              n={n}
              onClick={() => {
                if (n.read_at == null) readOne.mutate(n.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
