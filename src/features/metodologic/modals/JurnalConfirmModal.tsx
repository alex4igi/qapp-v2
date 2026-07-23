import { useState } from 'react'
import { Button, Field, Modal, TextArea } from '@/components/ui'

type Props = {
  open: boolean
  nrSedinta: number
  titluPlanificat: string
  notaInitiala?: string | null
  onClose: () => void
  onSave: (nota: string) => Promise<void>
}

/** „Am făcut altceva" — devierea de la plan se documentează, nu se ascunde. */
export function JurnalConfirmModal({
  open,
  nrSedinta,
  titluPlanificat,
  notaInitiala,
  onClose,
  onSave,
}: Props) {
  const [nota, setNota] = useState(notaInitiala ?? '')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  const salveaza = async () => {
    if (!nota.trim()) {
      setEroare('Scrie pe scurt ce ai făcut la ședință.')
      return
    }
    setSaving(true)
    setEroare(null)
    try {
      await onSave(nota.trim())
      onClose()
    } catch (e) {
      setEroare(e instanceof Error ? e.message : 'Eroare la salvare')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Ședința ${nrSedinta} — ce ai predat?`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={salveaza} disabled={saving}>
            {saving ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">
          Planificat: <span className="font-medium text-ink">{titluPlanificat}</span>
        </p>
        <Field label="Ce ai făcut în locul lecției planificate" required>
          <TextArea
            rows={4}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="ex. am reluat coregrafia de la ședința trecută — grupa n-a fost gata"
          />
        </Field>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
