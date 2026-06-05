import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { canalComunicareOptions, canaleOnlineOptions } from '@/lib/enums'
import type { CampaniePromovare } from '@/types/db'
import { createCampanie, deleteCampanie, updateCampanie } from './api'
import { WidgetSnippet } from './WidgetSnippet'

type Props = {
  open: boolean
  campanie?: CampaniePromovare | null
  onClose: () => void
}

type FormState = {
  nume: string
  descrierea: string
  canal_comunicare: string
  canale_online: string
  rezultate: string
  bani: string
}

function initialState(c?: CampaniePromovare | null): FormState {
  return {
    nume: c?.nume ?? '',
    descrierea: c?.descrierea ?? '',
    canal_comunicare: c?.canal_comunicare ?? '',
    canale_online: c?.canale_online ?? '',
    rezultate: c?.rezultate != null ? String(c.rezultate) : '',
    bani: c?.bani ?? '',
  }
}

const toNum = (s: string) => (s.trim() ? Number(s) : null)

export function CampanieForm({ open, campanie, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(campanie)
  const [form, setForm] = useState<FormState>(() => initialState(campanie))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['campanii'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        descrierea: form.descrierea.trim() || null,
        canal_comunicare:
          (form.canal_comunicare || null) as CampaniePromovare['canal_comunicare'],
        canale_online:
          (form.canale_online || null) as CampaniePromovare['canale_online'],
        rezultate: toNum(form.rezultate),
        bani: form.bani.trim() || null,
      }
      return isEdit
        ? updateCampanie(campanie!.id, payload)
        : createCampanie(payload)
    },
    onSuccess: () => {
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'campanii'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteCampanie(campanie!.id),
    onSuccess: () => {
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'campanii'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele campaniei este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează campanie' : 'Campanie nouă'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
            >
              Șterge
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="campanie-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="campanie-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nume" required htmlFor="nume">
          <TextInput
            id="nume"
            value={form.nume}
            onChange={(e) => set('nume')(e.target.value)}
          />
        </Field>

        <Field label="Descriere" htmlFor="descrierea">
          <TextArea
            id="descrierea"
            rows={3}
            value={form.descrierea}
            onChange={(e) => set('descrierea')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Canal" htmlFor="canal_comunicare">
            <Select
              id="canal_comunicare"
              placeholder="—"
              options={canalComunicareOptions}
              value={form.canal_comunicare}
              onChange={(e) => set('canal_comunicare')(e.target.value)}
            />
          </Field>
          <Field label="Sub-canal online" htmlFor="canale_online">
            <Select
              id="canale_online"
              placeholder="—"
              options={canaleOnlineOptions}
              value={form.canale_online}
              onChange={(e) => set('canale_online')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rezultate (nr. lead-uri estimate)" htmlFor="rezultate">
            <TextInput
              id="rezultate"
              type="number"
              value={form.rezultate}
              onChange={(e) => set('rezultate')(e.target.value)}
            />
          </Field>
          <Field label="Buget (RON)" htmlFor="bani">
            <TextInput
              id="bani"
              placeholder="ex: 500 RON"
              value={form.bani}
              onChange={(e) => set('bani')(e.target.value)}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {isEdit && <WidgetSnippet campanieNume={campanie!.nume} />}

        {confirmDelete && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-900">
              Ștergi campania <strong>{campanie?.nume}</strong>?
              Lead-urile asociate își vor pierde sursa.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="danger"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                {remove.isPending ? 'Se șterge…' : 'Confirmă ștergerea'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Anulează
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
