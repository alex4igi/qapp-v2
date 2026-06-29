import { Button, Field, Modal, TextArea } from '@/components/ui'

type Props = {
  open: boolean
  platit: number
  motiv: string
  isPending: boolean
  onMotivChange: (motiv: string) => void
  onConfirm: () => void
  onClose: () => void
}

// Ștergere fizică a unei înrolări create din greșeală (duplicat). Distinctă de
// reziliere: înlăturăm rândul complet. Permisă doar pentru înrolări fără bani
// încasați — dacă are plată, îndrumăm spre Mută/Reziliază (garda reală e în RPC).
export function ConfirmDeleteInrolareModal({
  open,
  platit,
  motiv,
  isPending,
  onMotivChange,
  onConfirm,
  onClose,
}: Props) {
  const arePlata = platit > 0

  return (
    <Modal
      open={open}
      title="Confirmă ștergerea înrolării"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          {!arePlata && (
            <Button variant="danger" onClick={onConfirm} disabled={isPending}>
              {isPending ? 'Se șterge…' : 'Șterge înrolarea'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {arePlata ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">
              Această înrolare are <strong>{platit} RON</strong> încasați și nu poate fi
              ștearsă (banii ar rămâne fără înrolare). Pentru a o anula, folosește
              <strong> Mută</strong> sau <strong>Reziliază</strong>.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-quasar-black">
              Înrolarea va fi <strong>ștearsă definitiv</strong>. Folosește asta doar
              pentru înrolări create din greșeală (duplicate). Acțiunea e auditată.
            </p>
            <Field label="Motiv ștergere" htmlFor="motiv-stergere">
              <TextArea
                id="motiv-stergere"
                rows={3}
                placeholder="Ex: duplicat din eroare la înrolare"
                value={motiv}
                onChange={(e) => onMotivChange(e.target.value)}
              />
            </Field>
            <Button variant="ghost" onClick={() => onMotivChange('Duplicat din eroare')}>
              Duplicat din eroare
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
