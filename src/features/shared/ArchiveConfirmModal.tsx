import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea } from '@/components/ui'

// Aceeași mecanică (flag + motiv + audit_log) poartă două vocabulare de domeniu:
// instructorii și programele se ARHIVEAZĂ, cursurile se SUSPENDĂ. Cuvintele
// diferă pentru că și așteptarea diferă — un curs suspendat se întoarce, un
// instructor arhivat de regulă nu.
export type ArchiveLexic = {
  titluDo: string
  titluUndo: string
  butonDo: string
  butonUndo: string
  intrebareDo: string
  intrebareUndo: string
  motivDo: string
  motivUndo: string
  placeholderDo: string
  placeholderUndo: string
  notaDo: string
  notaUndo: string
}

export const LEXIC_ARHIVARE: ArchiveLexic = {
  titluDo: 'Arhivează',
  titluUndo: 'Dezarhivează',
  butonDo: 'Arhivează',
  butonUndo: 'Dezarhivează',
  intrebareDo: 'Arhivezi:',
  intrebareUndo: 'Dezarhivezi:',
  motivDo: 'Motiv arhivare (obligatoriu)',
  motivUndo: 'Motiv (opțional)',
  placeholderDo: 'Ex: A plecat din organizație, nu mai predă…',
  placeholderUndo: 'Opțional — explică de ce-l readuci.',
  notaDo: 'Arhivarea ascunde din liste, dar păstrează istoricul.',
  notaUndo: 'Dezarhivarea îl readuce în liste.',
}

export const LEXIC_SUSPENDARE: ArchiveLexic = {
  titluDo: 'Suspendă',
  titluUndo: 'Re-activează',
  butonDo: 'Suspendă',
  butonUndo: 'Re-activează',
  intrebareDo: 'Suspenzi:',
  intrebareUndo: 'Re-activezi:',
  motivDo: 'Motiv suspendare (obligatoriu)',
  motivUndo: 'Motiv re-activare (opțional)',
  placeholderDo: 'Ex: Prea puțini cursanți, instructor plecat, sală indisponibilă…',
  placeholderUndo: 'Opțional — explică de ce o repornești.',
  notaDo:
    'Suspendarea o scoate din agendă, din salarii și din statistici, dar păstrează istoricul.',
  notaUndo: 'Re-activarea o readuce în agendă, în salarii și în statistici.',
}

type Props = {
  open: boolean
  title: string
  entityLabel: string
  archive: boolean
  lexic?: ArchiveLexic
  /** Conținut suplimentar în formular (ex. luna de la care repornește grupa). */
  children?: React.ReactNode
  onConfirm: (motiv: string) => Promise<void>
  onClose: () => void
}

export function ArchiveConfirmModal({
  open,
  title,
  entityLabel,
  archive,
  lexic = LEXIC_ARHIVARE,
  children,
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
      setError(`Motivul e obligatoriu la ${lexic.titluDo.toLowerCase()}re.`)
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
                ? lexic.butonDo
                : lexic.butonUndo}
          </Button>
        </>
      }
    >
      <form id="archive-confirm-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm">
          {archive ? lexic.intrebareDo : lexic.intrebareUndo}{' '}
          <strong className="text-quasar-black">{entityLabel}</strong>
        </p>
        {children}
        <Field
          label={archive ? lexic.motivDo : lexic.motivUndo}
          required={archive}
          htmlFor="archive-motiv"
        >
          <TextArea
            id="archive-motiv"
            rows={3}
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
            placeholder={archive ? lexic.placeholderDo : lexic.placeholderUndo}
          />
        </Field>
        <p className="text-xs text-quasar-gray">
          {archive ? lexic.notaDo : lexic.notaUndo} Acțiunea se înregistrează în
          jurnalul de audit.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
