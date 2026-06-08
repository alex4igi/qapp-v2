import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Checkbox,
  Button,
} from '@/components/ui'
import { tipFeedbackOptions } from '@/lib/enums'
import { clientiOptions, familiiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import type { Feedback } from '@/types/db'
import { createFeedback, updateFeedback, deleteFeedback } from './api'

type Props = {
  open: boolean
  feedback?: Feedback | null
  onClose: () => void
}

type FormState = {
  nume: string
  tip: string
  autor: string
  reprezentant: string
  cursul: string
  detalii: string
  rezolvat: boolean
  detalii_rezolvare: string
}

function initialState(f?: Feedback | null): FormState {
  return {
    nume: f?.nume ?? '',
    tip: f?.tip ?? '',
    autor: f?.autor ?? '',
    reprezentant: f?.reprezentant ?? '',
    cursul: f?.cursul ?? '',
    detalii: f?.detalii ?? '',
    rezolvat: f?.rezolvat ?? false,
    detalii_rezolvare: f?.detalii_rezolvare ?? '',
  }
}

export function FeedbackForm({ open, feedback, onClose }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isEdit = Boolean(feedback)
  const [form, setForm] = useState<FormState>(() => initialState(feedback))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const clienti = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })
  const familii = useQuery({
    queryKey: ['lookup', 'familii'],
    queryFn: familiiOptions,
  })
  const cursuri = useCursuriOptions()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['feedback'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim() || null,
        tip: (form.tip || null) as Feedback['tip'],
        autor: form.autor || null,
        reprezentant: form.reprezentant || null,
        cursul: form.cursul || null,
        detalii: form.detalii.trim() || null,
        rezolvat: form.rezolvat,
        detalii_rezolvare: form.detalii_rezolvare.trim() || null,
      }
      return isEdit
        ? updateFeedback(feedback!.id, payload)
        : createFeedback(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteFeedback(feedback!.id),
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
    if (!form.detalii.trim() && !form.nume.trim()) {
      setError('Completează cel puțin titlul sau detaliile.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează feedback' : 'Feedback nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && isAdminOrHigher(role) && (
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
                  Șterge feedback
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="feedback-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="feedback-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Titlu" htmlFor="nume">
            <TextInput
              id="nume"
              value={form.nume}
              onChange={(e) => set('nume', e.target.value)}
            />
          </Field>
          <Field label="Tip" htmlFor="tip">
            <Select
              id="tip"
              placeholder="—"
              options={tipFeedbackOptions}
              value={form.tip}
              onChange={(e) => set('tip', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Detalii" htmlFor="detalii">
          <TextArea
            id="detalii"
            rows={3}
            value={form.detalii}
            onChange={(e) => set('detalii', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Autor (client)" htmlFor="autor">
            <Select
              id="autor"
              placeholder="—"
              options={clienti.data ?? []}
              value={form.autor}
              onChange={(e) => set('autor', e.target.value)}
            />
          </Field>
          <Field label="Familie" htmlFor="reprezentant">
            <Select
              id="reprezentant"
              placeholder="—"
              options={familii.data ?? []}
              value={form.reprezentant}
              onChange={(e) => set('reprezentant', e.target.value)}
            />
          </Field>
          <Field label="Curs" htmlFor="cursul">
            <Select
              id="cursul"
              placeholder="—"
              options={cursuri.data ?? []}
              value={form.cursul}
              onChange={(e) => set('cursul', e.target.value)}
            />
          </Field>
        </div>

        <Checkbox
          id="rezolvat"
          label="Rezolvat"
          checked={form.rezolvat}
          onChange={(e) => set('rezolvat', e.target.checked)}
        />

        {form.rezolvat && (
          <Field label="Detalii rezolvare" htmlFor="detalii_rezolvare">
            <TextArea
              id="detalii_rezolvare"
              rows={2}
              value={form.detalii_rezolvare}
              onChange={(e) => set('detalii_rezolvare', e.target.value)}
            />
          </Field>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
