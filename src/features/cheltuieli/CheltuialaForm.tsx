import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Checkbox,
  Select,
  Button,
} from '@/components/ui'
import { categorieCheltuialaOptions } from '@/lib/enums'
import type { Cheltuiala } from '@/types/db'
import {
  createCheltuiala,
  updateCheltuiala,
  deleteCheltuiala,
} from './api'

type Props = {
  open: boolean
  cheltuiala?: Cheltuiala | null
  onClose: () => void
}

type FormState = {
  nume: string
  descriere: string
  valoare: string
  deadline: string
  achitat: boolean
  categorie: string
}

function initialState(c?: Cheltuiala | null): FormState {
  return {
    nume: c?.nume ?? '',
    descriere: c?.descriere ?? '',
    valoare: c?.valoare != null ? String(c.valoare) : '',
    deadline: c?.deadline ?? '',
    achitat: c?.achitat ?? false,
    categorie: c?.categorie ?? '',
  }
}

export function CheltuialaForm({ open, cheltuiala, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(cheltuiala)
  const [form, setForm] = useState<FormState>(() => initialState(cheltuiala))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cheltuieli'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        descriere: form.descriere.trim() || null,
        valoare: form.valoare.trim() ? Number(form.valoare) : null,
        deadline: form.deadline || null,
        achitat: form.achitat,
        categorie: (form.categorie || null) as Cheltuiala['categorie'],
      }
      return isEdit
        ? updateCheltuiala(cheltuiala!.id, payload)
        : createCheltuiala(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteCheltuiala(cheltuiala!.id),
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
    if (!form.nume.trim()) {
      setError('Numele cheltuielii este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează cheltuială' : 'Cheltuială nouă'}
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
                  Șterge cheltuială
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="cheltuiala-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="cheltuiala-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nume" required htmlFor="nume">
          <TextInput
            id="nume"
            value={form.nume}
            onChange={(e) => set('nume', e.target.value)}
          />
        </Field>

        <Field label="Descriere" htmlFor="descriere">
          <TextArea
            id="descriere"
            rows={2}
            value={form.descriere}
            onChange={(e) => set('descriere', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valoare (RON)" htmlFor="valoare">
            <TextInput
              id="valoare"
              type="number"
              min={0}
              value={form.valoare}
              onChange={(e) => set('valoare', e.target.value)}
            />
          </Field>
          <Field label="Deadline" htmlFor="deadline">
            <TextInput
              id="deadline"
              type="date"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Categorie" htmlFor="categorie">
          <Select
            id="categorie"
            placeholder="—"
            options={categorieCheltuialaOptions}
            value={form.categorie}
            onChange={(e) => set('categorie', e.target.value)}
          />
        </Field>

        <Checkbox
          id="achitat"
          label="Achitată"
          checked={form.achitat}
          onChange={(e) => set('achitat', e.target.checked)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
