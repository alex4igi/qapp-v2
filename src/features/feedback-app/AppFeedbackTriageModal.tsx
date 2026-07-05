import { humanizeError } from '@/lib/errorMessage'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, Select, TextArea, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/format'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import type { AppFeedback, AppFeedbackStatus } from '@/types/db'
import { STATUS_BADGE, STATUS_LABEL, TIP_LABEL, statusOptions } from './constants'
import { updateAppFeedback, deleteAppFeedback } from './api'

type Props = {
  feedback: AppFeedback
  onClose: () => void
}

export function AppFeedbackTriageModal({ feedback, onClose }: Props) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const canManage = isAdminOrHigher(role)

  const [status, setStatus] = useState<AppFeedbackStatus>(feedback.status)
  const [raspuns, setRaspuns] = useState(feedback.raspuns ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['app-feedback'] })

  const save = useMutation({
    mutationFn: () =>
      updateAppFeedback(feedback.id, {
        status,
        raspuns: raspuns.trim() || null,
      }),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteAppFeedback(feedback.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  return (
    <Modal
      open
      title={feedback.titlu}
      onClose={onClose}
      footer={
        canManage ? (
          <>
            {confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-sm text-quasar-gray">Confirmi ștergerea?</span>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Șterge
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Nu
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                Șterge
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Anulează
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Închide
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-quasar-gray-light px-2 py-0.5 font-medium">
            {TIP_LABEL[feedback.tip]}
          </span>
          <span
            className={`rounded px-2 py-0.5 font-medium ${STATUS_BADGE[feedback.status]}`}
          >
            {STATUS_LABEL[feedback.status]}
          </span>
          <span className="text-quasar-gray">{formatDateTime(feedback.created)}</span>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-quasar-gray">Autor</dt>
          <dd className="text-quasar-black">{feedback.autor_email ?? '—'}</dd>
          <dt className="text-quasar-gray">Pagina</dt>
          <dd className="text-quasar-black">{feedback.pagina ?? '—'}</dd>
        </dl>

        {feedback.detalii && (
          <div>
            <p className="mb-1 text-sm font-medium text-quasar-black">Detalii</p>
            <p className="whitespace-pre-wrap rounded-md bg-quasar-gray-light/40 p-3 text-sm text-quasar-black">
              {feedback.detalii}
            </p>
          </div>
        )}

        {feedback.user_agent && (
          <details className="text-xs text-quasar-gray">
            <summary className="cursor-pointer select-none">Detalii tehnice</summary>
            <p className="mt-1 break-words">{feedback.user_agent}</p>
          </details>
        )}

        {/* Triere (doar admin/owner) */}
        {canManage ? (
          <div className="space-y-3 border-t border-quasar-gray-light pt-4">
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                options={statusOptions}
                value={status}
                onChange={(e) => setStatus(e.target.value as AppFeedbackStatus)}
              />
            </Field>
            <Field label="Răspuns către autor" htmlFor="raspuns">
              <TextArea
                id="raspuns"
                rows={3}
                placeholder="Răspunsul tău — vizibil pentru cel care a trimis feedback-ul."
                value={raspuns}
                onChange={(e) => setRaspuns(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          feedback.raspuns && (
            <div className="border-t border-quasar-gray-light pt-4">
              <p className="mb-1 text-sm font-medium text-quasar-black">
                Răspuns echipă
              </p>
              <p className="whitespace-pre-wrap rounded-md bg-quasar-yellow/20 p-3 text-sm text-quasar-black">
                {feedback.raspuns}
              </p>
            </div>
          )
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
