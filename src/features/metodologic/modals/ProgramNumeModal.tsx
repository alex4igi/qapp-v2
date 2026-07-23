import { useEffect, useState } from 'react'
import { Button, Field, Modal, TextArea, TextInput } from '@/components/ui'
import type { Program } from '../types'

type Props = {
  program: Program | null
  onClose: () => void
  onSave: (patch: { nume: string; descriere: string | null }) => Promise<void>
}

/** Editează numele (și descrierea) programului. */
export function ProgramNumeModal({ program, onClose, onSave }: Props) {
  const [nume, setNume] = useState('')
  const [descriere, setDescriere] = useState('')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    setNume(program?.nume ?? '')
    setDescriere(program?.descriere ?? '')
    setEroare(null)
  }, [program])

  if (!program) return null

  const salveaza = async () => {
    if (!nume.trim()) {
      setEroare('Numele e obligatoriu.')
      return
    }
    setSaving(true)
    setEroare(null)
    try {
      await onSave({ nume: nume.trim(), descriere: descriere.trim() || null })
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
      title="Editează programul"
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
        <Field label="Nume program" required>
          <TextInput value={nume} onChange={(e) => setNume(e.target.value)} />
        </Field>
        <Field label="Descriere">
          <TextArea rows={2} value={descriere} onChange={(e) => setDescriere(e.target.value)} />
        </Field>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
