import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { sezoaneOptions } from '@/lib/lookups'
import type { Spectacol, StatusSpectacol } from '@/types/db'
import {
  createSpectacol,
  updateSpectacol,
  deleteSpectacol,
} from './api'

type Props = {
  open: boolean
  spectacol?: Spectacol | null
  onClose: () => void
  onCreated?: (s: Spectacol) => void
}

const STATUS_OPTIONS: { value: StatusSpectacol; label: string }[] = [
  { value: 'planificat', label: 'Planificat' },
  { value: 'confirmat', label: 'Confirmat' },
  { value: 'finalizat', label: 'Finalizat' },
  { value: 'anulat', label: 'Anulat' },
]

type FormState = {
  nume: string
  data: string
  ora: string
  locatie: string
  sezon: string
  status: StatusSpectacol
  note: string
}

function initialState(s?: Spectacol | null): FormState {
  return {
    nume: s?.nume ?? '',
    data: s?.data ?? '',
    ora: s?.ora ?? '',
    locatie: s?.locatie ?? '',
    sezon: s?.sezon ?? '',
    status: (s?.status as StatusSpectacol) ?? 'planificat',
    note: s?.note ?? '',
  }
}

export function SpectacolForm({ open, spectacol, onClose, onCreated }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(spectacol)
  const [form, setForm] = useState<FormState>(() => initialState(spectacol))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['spectacole'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        data: form.data || null,
        ora: form.ora.trim() || null,
        locatie: form.locatie.trim() || null,
        sezon: form.sezon || null,
        status: form.status,
        note: form.note.trim() || null,
      }
      return isEdit
        ? updateSpectacol(spectacol!.id, payload)
        : createSpectacol(payload)
    },
    onSuccess: (s) => {
      void invalidate()
      onCreated?.(s)
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteSpectacol(spectacol!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele spectacolului este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează spectacol' : 'Spectacol nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">
                    Confirmi ștergerea?
                  </span>
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Șterge
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Nu
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Șterge spectacol
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="spectacol-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="spectacol-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nume spectacol" required htmlFor="nume">
          <TextInput
            id="nume"
            value={form.nume}
            onChange={(e) => set('nume')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" htmlFor="data">
            <DateInput
              id="data"
              value={form.data}
              onChange={(e) => set('data')(e.target.value)}
            />
          </Field>
          <Field label="Ora" htmlFor="ora">
            <TextInput
              id="ora"
              placeholder="ex. 18:00"
              value={form.ora}
              onChange={(e) => set('ora')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Locație" htmlFor="locatie">
          <TextInput
            id="locatie"
            value={form.locatie}
            onChange={(e) => set('locatie')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sezon" htmlFor="sezon">
            <Select
              id="sezon"
              placeholder="— alege —"
              options={sezoaneQ.data ?? []}
              value={form.sezon}
              onChange={(e) => set('sezon')(e.target.value)}
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              options={STATUS_OPTIONS}
              value={form.status}
              onChange={(e) => set('status')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="note">
          <TextArea
            id="note"
            rows={3}
            value={form.note}
            onChange={(e) => set('note')(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
