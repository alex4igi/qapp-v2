import { useEffect, useState } from 'react'
import { Button, Field, Modal, TextInput } from '@/components/ui'
import type { ModulAfisat } from '../types'

type Props = {
  modul: ModulAfisat | null
  onClose: () => void
  onSave: (patch: { tema: string | null; subtitlu: string | null }) => Promise<void>
}

export function ModulEditModal({ modul, onClose, onSave }: Props) {
  const [tema, setTema] = useState('')
  const [subtitlu, setSubtitlu] = useState('')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    setTema(modul?.modul.tema ?? '')
    setSubtitlu(modul?.modul.subtitlu ?? '')
    setEroare(null)
  }, [modul])

  if (!modul) return null

  const salveaza = async () => {
    setSaving(true)
    setEroare(null)
    try {
      await onSave({ tema: tema.trim() || null, subtitlu: subtitlu.trim() || null })
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
      title={`MODUL ${modul.modul.numar}`}
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
        <Field label="Temă (stilul modulului)">
          <TextInput
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="ex. HIP-HOP/TRAP"
          />
        </Field>
        <Field label="Descriere grup">
          <TextInput
            value={subtitlu}
            onChange={(e) => setSubtitlu(e.target.value)}
            placeholder="ex. Grup Junior Intermediari — Intermediari · HIP-HOP/TRAP"
          />
        </Field>
        <p className="text-xs text-muted">
          Datele modulului se editează în calendarul sezonului — sunt comune tuturor
          programelor.
        </p>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
