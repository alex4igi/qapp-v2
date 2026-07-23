import { useEffect, useState } from 'react'
import { Button, Field, Modal, Select, TextArea, TextInput } from '@/components/ui'
import { TIP_LECTIE_LABEL } from '../constants'
import type { LectieAfisata, TipLectie } from '../types'

type Props = {
  lectie: LectieAfisata | null
  onClose: () => void
  onSave: (patch: { titlu: string; note: string | null; tip: TipLectie }) => Promise<void>
  onDelete?: () => Promise<void>
}

/** Editarea standardului (management). Adaptarea per grupă e în OverrideModal. */
export function LectieEditModal({ lectie, onClose, onSave, onDelete }: Props) {
  const [titlu, setTitlu] = useState('')
  const [note, setNote] = useState('')
  const [tip, setTip] = useState<TipLectie>('lectie')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    setTitlu(lectie?.titlu ?? '')
    setNote(lectie?.note ?? '')
    setTip((lectie?.tip as TipLectie) ?? 'lectie')
    setEroare(null)
  }, [lectie])

  if (!lectie) return null

  const salveaza = async () => {
    if (!titlu.trim()) {
      setEroare('Titlul e obligatoriu.')
      return
    }
    setSaving(true)
    setEroare(null)
    try {
      await onSave({ titlu: titlu.trim(), note: note.trim() || null, tip })
      onClose()
    } catch (e) {
      setEroare(e instanceof Error ? e.message : 'Eroare la salvare')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Ședința ${lectie.nr_sedinta}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {onDelete ? (
            <Button variant="ghost" onClick={onDelete} disabled={saving}>
              Șterge ședința
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
        <Field label="Lecție / Temă" required>
          <TextInput value={titlu} onChange={(e) => setTitlu(e.target.value)} />
        </Field>
        <Field label="Note pentru instructor">
          <TextArea rows={5} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Tip">
          <Select
            value={tip}
            onChange={(e) => setTip(e.target.value as TipLectie)}
            options={Object.entries(TIP_LECTIE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <p className="text-xs text-muted">
          Modificarea afectează toate grupele care folosesc acest program. Pentru o singură
          grupă, folosește adaptarea din fișa cursului.
        </p>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
