import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea } from '@/components/ui'

type Props = {
  open: boolean
  title: string
  entityLabel: string
  archive: boolean
  onConfirm: (motiv: string) => Promise<void>
  onClose: () => void
}

export function ArchiveConfirmModal({
  open,
  title,
  entityLabel,
  archive,
  onConfirm,
  onClose,
}: Props) {
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: (m: string) => onConfirm(m),
    onSuccess: () => {
      setMotiv('')
      setError(null)
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (archive && !motiv.trim()) {
      setError('Motivul e obligatoriu la arhivare.')
      return
    }
    run.mutate(motiv.trim())
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="archive-confirm-form"
            variant={archive ? 'danger' : 'primary'}
            disabled={run.isPending}
          >
            {run.isPending
              ? 'Se salvează…'
              : archive
                ? 'Arhivează'
                : 'Dezarhivează'}
          </Button>
        </>
      }
    >
      <form id="archive-confirm-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm">
          {archive ? 'Arhivezi:' : 'Dezarhivezi:'}{' '}
          <strong className="text-quasar-black">{entityLabel}</strong>
        </p>
        <Field
          label={archive ? 'Motiv arhivare (obligatoriu)' : 'Motiv (opțional)'}
          required={archive}
          htmlFor="archive-motiv"
        >
          <TextArea
            id="archive-motiv"
            rows={3}
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
            placeholder={
              archive
                ? 'Ex: Sezon încheiat, instructor plecat, curs sistat temporar…'
                : 'Opțional — explică de ce-l reactivezi.'
            }
          />
        </Field>
        <p className="text-xs text-quasar-gray">
          {archive
            ? 'Arhivarea ascunde din liste, dar păstrează istoricul.'
            : 'Dezarhivarea îl readuce în liste.'}{' '}
          Acțiunea se înregistrează în jurnalul de audit.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
