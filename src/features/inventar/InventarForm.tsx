import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { categorieInventarOptions } from '@/lib/enums'
import { locatiiOptions } from '@/lib/lookups'
import type { Inventar } from '@/types/db'
import { createInventar, updateInventar, deleteInventar } from './api'

type Props = {
  open: boolean
  articol?: Inventar | null
  onClose: () => void
}

type FormState = {
  articol: string
  descriere: string
  stoc: string
  pret: string
  locatie: string
  categorie: string
}

function initialState(a?: Inventar | null): FormState {
  return {
    articol: a?.articol ?? '',
    descriere: a?.descriere ?? '',
    stoc: a?.stoc != null ? String(a.stoc) : '',
    pret: a?.pret ?? '',
    locatie: a?.locatie ?? '',
    categorie: a?.categorie ?? '',
  }
}

export function InventarForm({ open, articol, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(articol)
  const [form, setForm] = useState<FormState>(() => initialState(articol))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['inventar'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        articol: form.articol.trim(),
        descriere: form.descriere.trim() || null,
        stoc: form.stoc.trim() ? Number(form.stoc) : null,
        pret: form.pret.trim() || null,
        locatie: form.locatie || null,
        categorie: (form.categorie || null) as Inventar['categorie'],
      }
      return isEdit
        ? updateInventar(articol!.id, payload)
        : createInventar(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteInventar(articol!.id),
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
    if (!form.articol.trim()) {
      setError('Articolul este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează articol' : 'Articol nou'}
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
                  Șterge articol
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="inventar-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="inventar-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Articol" required htmlFor="articol">
          <TextInput
            id="articol"
            value={form.articol}
            onChange={(e) => set('articol')(e.target.value)}
          />
        </Field>

        <Field label="Descriere" htmlFor="descriere">
          <TextArea
            id="descriere"
            rows={2}
            value={form.descriere}
            onChange={(e) => set('descriere')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stoc" htmlFor="stoc">
            <TextInput
              id="stoc"
              type="number"
              min={0}
              value={form.stoc}
              onChange={(e) => set('stoc')(e.target.value)}
            />
          </Field>
          <Field label="Preț" htmlFor="pret">
            <TextInput
              id="pret"
              value={form.pret}
              onChange={(e) => set('pret')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categorie" htmlFor="categorie">
            <Select
              id="categorie"
              placeholder="—"
              options={categorieInventarOptions}
              value={form.categorie}
              onChange={(e) => set('categorie')(e.target.value)}
            />
          </Field>
          <Field label="Locație" htmlFor="locatie">
            <Select
              id="locatie"
              placeholder="—"
              options={locatii.data ?? []}
              value={form.locatie}
              onChange={(e) => set('locatie')(e.target.value)}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
