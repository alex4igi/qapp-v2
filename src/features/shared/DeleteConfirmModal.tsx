import { useMutation } from '@tanstack/react-query'
import { Button, Modal } from '@/components/ui'

type Props = {
  open: boolean
  title: string
  entityLabel: string
  // Mesaj scurt despre ce se șterge (ex. „instructorul", „cursul").
  noun: string
  onConfirm: () => Promise<void>
  onClose: () => void
}

// Confirmare pentru ștergere DEFINITIVĂ (admin). Garda reală e în RPC-ul din DB:
// dacă entitatea are dependențe, RPC-ul aruncă un mesaj clar pe care îl arătăm aici.
export function DeleteConfirmModal({
  open,
  title,
  entityLabel,
  noun,
  onConfirm,
  onClose,
}: Props) {
  const run = useMutation({
    mutationFn: () => onConfirm(),
    onSuccess: () => onClose(),
  })

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
          <Button variant="danger" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? 'Se șterge…' : 'Șterge definitiv'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          Ștergi definitiv {noun}{' '}
          <strong className="text-quasar-black">{entityLabel}</strong>?
        </p>
        <p className="text-xs text-quasar-gray">
          Acțiunea <strong>nu poate fi anulată</strong>. Se poate șterge doar dacă nu
          are date asociate (înrolări, plăți, evaluări etc.). Dacă are, arhivează-l în
          loc. Ștergerea se înregistrează în jurnalul de audit.
        </p>
        {run.isError && (
          <p className="text-sm text-red-600">
            {run.error instanceof Error ? run.error.message : 'Eroare la ștergere.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
