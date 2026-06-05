import { Button, Checkbox, Field, Modal, TextArea } from '@/components/ui'

type Props = {
  open: boolean
  cursId: string
  reziliereCount: number
  motiv: string
  reintegrateAsLead: boolean
  isPending: boolean
  onMotivChange: (motiv: string) => void
  onReintegrateChange: (reintegrate: boolean) => void
  onConfirm: () => void
  onClose: () => void
}

// Confirmare reziliere înrolări viitoare la un curs. Permite opțional
// reintegrarea clientului în pipeline-ul de leads ca „Nurture", pentru
// campanii de reactivare ulterioare.
export function ConfirmReziliereModal({
  open,
  reziliereCount,
  motiv,
  reintegrateAsLead,
  isPending,
  onMotivChange,
  onReintegrateChange,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      title="Confirmă rezilierea"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Se reziliază…' : 'Reziliază'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-quasar-black">
          Vor fi reziliate <strong>{reziliereCount} luni</strong> viitoare.
          Înrolarea curentă (luna aceasta) rămâne intactă.
        </p>
        <Field label="Motiv reziliere (opțional)" htmlFor="motiv-reziliere">
          <TextArea
            id="motiv-reziliere"
            rows={3}
            placeholder="Ex: a schimbat școala, conflict orar, financiar…"
            value={motiv}
            onChange={(e) => onMotivChange(e.target.value)}
          />
        </Field>
        <Checkbox
          id="reintegrate-as-lead"
          label="Reintegrează clientul ca lead în Nurture (pentru campanii de reactivare)"
          checked={reintegrateAsLead}
          onChange={(e) => onReintegrateChange(e.target.checked)}
        />
      </div>
    </Modal>
  )
}
