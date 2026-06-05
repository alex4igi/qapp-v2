import { Button, Modal } from '@/components/ui'
import type { UserRow } from '../../utilizatoriApi'

type Props = {
  user: UserRow
  isPending: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDeleteModal({ user, isPending, error, onConfirm, onClose }: Props) {
  return (
    <Modal
      open
      title="Confirmi ștergerea?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button variant="danger" disabled={isPending} onClick={onConfirm}>
            {isPending ? 'Se șterge…' : 'Șterge'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm">
          Ștergi contul <strong>{user.email}</strong>. Acțiunea nu poate fi anulată.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
