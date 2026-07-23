import { useEffect, useState } from 'react'
import { Button, Field, Modal, TextArea, TextInput } from '@/components/ui'
import type { LectieAfisata } from '../types'

type Props = {
  lectie: LectieAfisata | null
  onClose: () => void
  onSave: (patch: { titlu: string | null; note: string | null }) => Promise<void>
}

/**
 * Adaptarea unei lecții pentru O grupă. Standardul rămâne neatins.
 * Câmpurile pornesc din valoarea afișată (override sau standard); golirea unui
 * câmp îl readuce la standard, iar golirea ambelor șterge adaptarea.
 */
export function OverrideModal({ lectie, onClose, onSave }: Props) {
  const [titlu, setTitlu] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    setTitlu(lectie?.titluAfisat ?? '')
    setNote(lectie?.noteAfisate ?? '')
    setEroare(null)
  }, [lectie])

  if (!lectie) return null

  // Trimitem null pe câmpurile lăsate egale cu standardul: adaptarea reține doar
  // ce diferă efectiv.
  const salveaza = async () => {
    setSaving(true)
    setEroare(null)
    try {
      const titluFinal = titlu.trim() && titlu.trim() !== lectie.titlu ? titlu.trim() : null
      const noteFinal = note.trim() && note.trim() !== (lectie.note ?? '') ? note.trim() : null
      await onSave({ titlu: titluFinal, note: noteFinal })
      onClose()
    } catch (e) {
      setEroare(e instanceof Error ? e.message : 'Eroare la salvare')
    } finally {
      setSaving(false)
    }
  }

  const readapteaza = async () => {
    setSaving(true)
    try {
      await onSave({ titlu: null, note: null })
      onClose()
    } catch (e) {
      setEroare(e instanceof Error ? e.message : 'Eroare')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Ședința ${lectie.nr_sedinta} — adaptează pentru grupă`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {lectie.adaptat ? (
            <Button variant="ghost" onClick={readapteaza} disabled={saving}>
              Revino la standard
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Renunță
            </Button>
            <Button onClick={salveaza} disabled={saving}>
              {saving ? 'Se salvează…' : 'Salvează'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Lecție / Temă">
          <TextInput value={titlu} onChange={(e) => setTitlu(e.target.value)} />
        </Field>
        <Field label="Note">
          <TextArea rows={5} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">
          Modificarea e doar pentru această grupă — standardul programului rămâne neschimbat.
        </p>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
