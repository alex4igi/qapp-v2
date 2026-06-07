import { useQuery } from '@tanstack/react-query'
import { Button, Checkbox, Field, Modal, TextArea } from '@/components/ui'
import { getReziliereRecalcPreview } from '@/features/plati/api'

type Props = {
  open: boolean
  cursId: string
  clientId: string
  reziliereCount: number
  motiv: string
  reintegrateAsLead: boolean
  canRecalc: boolean
  recalcChecked: boolean
  isPending: boolean
  onMotivChange: (motiv: string) => void
  onReintegrateChange: (reintegrate: boolean) => void
  onRecalcChange: (recalc: boolean) => void
  onConfirm: () => void
  onClose: () => void
}

// Confirmare reziliere înrolări viitoare la un curs. Permite opțional
// reintegrarea clientului în pipeline-ul de leads ca „Nurture", pentru
// campanii de reactivare ulterioare. Pentru manager+, permite recalcularea
// ultimei luni la prețul de recuperare (preț ședință reziliere × prezențe).
export function ConfirmReziliereModal({
  open,
  cursId,
  clientId,
  reziliereCount,
  motiv,
  reintegrateAsLead,
  canRecalc,
  recalcChecked,
  isPending,
  onMotivChange,
  onReintegrateChange,
  onRecalcChange,
  onConfirm,
  onClose,
}: Props) {
  const recalcQ = useQuery({
    queryKey: ['reziliere-recalc', clientId, cursId],
    queryFn: () => getReziliereRecalcPreview({ clientId, cursId }),
    enabled: open && canRecalc,
  })
  const preview = recalcQ.data

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

        {canRecalc && preview?.applicable && (
          <div className="rounded-md border border-quasar-yellow/60 bg-quasar-yellow/10 p-3 space-y-2">
            <Checkbox
              id="recalc-ultima-luna"
              label={`Recalculează ultima lună la preț de recuperare (${preview.suma} RON = ${preview.sedinte} ședințe × ${preview.pretSedintaReziliere} RON)`}
              checked={recalcChecked}
              onChange={(e) => onRecalcChange(e.target.checked)}
            />
            <p className="text-xs text-quasar-gray">
              Modificarea de preț e auditată și notifică adminii. Plățile deja
              înregistrate rămân neschimbate.
            </p>
          </div>
        )}
        {canRecalc && preview && !preview.applicable && (
          <p className="text-xs text-quasar-gray">
            Recalcul ultima lună indisponibil: {preview.reason}
          </p>
        )}
      </div>
    </Modal>
  )
}
