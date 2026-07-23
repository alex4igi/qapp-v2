import { useEffect, useState } from 'react'
import { Button, DateInput, Field, Modal, TextArea, TextInput } from '@/components/ui'
import type { CalendarInput } from '../api'
import type { SezonCalendarRand } from '../types'

type Props = {
  rand: SezonCalendarRand | null
  onClose: () => void
  onSave: (patch: CalendarInput) => Promise<void>
  onDelete?: () => Promise<void>
}

export function CalendarEditModal({ rand, onClose, onSave, onDelete }: Props) {
  const [nume, setNume] = useState('')
  const [nota, setNota] = useState('')
  const [start, setStart] = useState('')
  const [final, setFinal] = useState('')
  const [saving, setSaving] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    setNume(rand?.nume ?? '')
    setNota(rand?.nota ?? '')
    setStart(rand?.data_incepere ?? '')
    setFinal(rand?.data_final ?? '')
    setEroare(null)
  }, [rand])

  if (!rand) return null
  const eVacanta = rand.tip === 'vacanta'

  const salveaza = async () => {
    if (start && final && final < start) {
      setEroare('Data de final e înaintea celei de început.')
      return
    }
    setSaving(true)
    setEroare(null)
    try {
      await onSave({
        nume: nume.trim() || null,
        nota: nota.trim() || null,
        data_incepere: start || null,
        data_final: final || null,
      })
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
      title={`${eVacanta ? 'Vacanță' : 'Modul'} ${rand.numar}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {onDelete ? (
            <Button variant="ghost" onClick={onDelete} disabled={saving}>
              Șterge
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
        <Field label="Nume">
          <TextInput value={nume} onChange={(e) => setNume(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Început">
            <DateInput value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Final">
            <DateInput value={final} onChange={(e) => setFinal(e.target.value)} />
          </Field>
        </div>
        {eVacanta && (
          <Field label="Notă (activități / marketing)">
            <TextArea value={nota} onChange={(e) => setNota(e.target.value)} />
          </Field>
        )}
        {!start || !final ? (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
            Fără ambele date, modulul nu contează la activarea programelor sezonului.
          </p>
        ) : null}
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}
