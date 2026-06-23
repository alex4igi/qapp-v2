import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Button,
} from '@/components/ui'
import type { Concurs } from '@/types/db'
import { createConcurs, updateConcurs, deleteConcurs } from './api'

type Props = {
  open: boolean
  concurs?: Concurs | null
  onClose: () => void
}

type FormState = {
  numele_concursului: string
  data_evenimentului: string
  rezultate_obtinute: string
  locul_i: string
  locul_ii: string
  locul_iii: string
}

function initialState(c?: Concurs | null): FormState {
  return {
    numele_concursului: c?.numele_concursului ?? '',
    data_evenimentului: c?.data_evenimentului ?? '',
    rezultate_obtinute: c?.rezultate_obtinute ?? '',
    locul_i: c?.locul_i != null ? String(c.locul_i) : '',
    locul_ii: c?.locul_ii != null ? String(c.locul_ii) : '',
    locul_iii: c?.locul_iii != null ? String(c.locul_iii) : '',
  }
}

const toNum = (s: string) => (s.trim() ? Number(s) : null)

export function ConcursForm({ open, concurs, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(concurs)
  const [form, setForm] = useState<FormState>(() => initialState(concurs))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['concursuri'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        numele_concursului: form.numele_concursului.trim(),
        data_evenimentului: form.data_evenimentului || null,
        rezultate_obtinute: form.rezultate_obtinute.trim() || null,
        locul_i: toNum(form.locul_i),
        locul_ii: toNum(form.locul_ii),
        locul_iii: toNum(form.locul_iii),
      }
      return isEdit
        ? updateConcurs(concurs!.id, payload)
        : createConcurs(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteConcurs(concurs!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.numele_concursului.trim()) {
      setError('Numele concursului este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează concurs' : 'Concurs nou'}
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
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Nu
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Șterge concurs
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="concurs-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="concurs-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nume concurs" required htmlFor="numele_concursului">
          <TextInput
            id="numele_concursului"
            value={form.numele_concursului}
            onChange={(e) => set('numele_concursului')(e.target.value)}
          />
        </Field>

        <Field label="Data evenimentului" htmlFor="data_evenimentului">
          <DateInput
            id="data_evenimentului"
            value={form.data_evenimentului}
            onChange={(e) => set('data_evenimentului')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Locul I" htmlFor="locul_i">
            <TextInput
              id="locul_i"
              type="number"
              min={0}
              value={form.locul_i}
              onChange={(e) => set('locul_i')(e.target.value)}
            />
          </Field>
          <Field label="Locul II" htmlFor="locul_ii">
            <TextInput
              id="locul_ii"
              type="number"
              min={0}
              value={form.locul_ii}
              onChange={(e) => set('locul_ii')(e.target.value)}
            />
          </Field>
          <Field label="Locul III" htmlFor="locul_iii">
            <TextInput
              id="locul_iii"
              type="number"
              min={0}
              value={form.locul_iii}
              onChange={(e) => set('locul_iii')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Rezultate obținute" htmlFor="rezultate_obtinute">
          <TextArea
            id="rezultate_obtinute"
            rows={3}
            value={form.rezultate_obtinute}
            onChange={(e) => set('rezultate_obtinute')(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
