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
import { statusEvenimentOptions, tipEvenimentOptions } from '@/lib/enums'
import { teacheriOptions } from '@/lib/lookups'
import type { Eveniment } from '@/types/db'
import { createEveniment, updateEveniment, deleteEveniment } from './api'

type Props = {
  open: boolean
  eveniment?: Eveniment | null
  onClose: () => void
}

type FormState = {
  nume_eveniment: string
  tip: string
  descriere: string
  data: string
  locatia: string
  organizator: string
  capacitate: string
  pret_bilet: string
  cost_organizare: string
  status: string
  notite: string
  public: boolean
}

function initialState(e?: Eveniment | null): FormState {
  return {
    nume_eveniment: e?.nume_eveniment ?? '',
    tip: e?.tip ?? 'Eveniment',
    descriere: e?.descriere ?? '',
    data: e?.data ?? '',
    locatia: e?.locatia ?? '',
    organizator: e?.organizator ?? '',
    capacitate: e?.capacitate != null ? String(e.capacitate) : '',
    pret_bilet: e?.pret_bilet != null ? String(e.pret_bilet) : '',
    cost_organizare:
      e?.cost_organizare != null ? String(e.cost_organizare) : '',
    status: e?.status ?? '',
    notite: e?.notite ?? '',
    public: e?.public ?? false,
  }
}

const toNum = (s: string) => (s.trim() ? Number(s) : null)

export function EvenimentForm({ open, eveniment, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(eveniment)
  const [form, setForm] = useState<FormState>(() => initialState(eveniment))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: teacheriOptions,
  })

  const set = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['evenimente'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume_eveniment: form.nume_eveniment.trim(),
        tip: form.tip as Eveniment['tip'],
        descriere: form.descriere.trim() || null,
        data: form.data || null,
        locatia: form.locatia.trim() || null,
        organizator: form.organizator || null,
        capacitate: toNum(form.capacitate),
        pret_bilet: toNum(form.pret_bilet),
        cost_organizare: toNum(form.cost_organizare),
        status: (form.status || null) as Eveniment['status'],
        notite: form.notite.trim() || null,
        public: form.public,
      }
      return isEdit
        ? updateEveniment(eveniment!.id, payload)
        : createEveniment(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteEveniment(eveniment!.id),
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
    if (!form.nume_eveniment.trim()) {
      setError('Numele evenimentului este obligatoriu.')
      return
    }
    if (form.public && !form.data) {
      setError('Un eveniment afișat pe portal are nevoie de o dată.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează eveniment' : 'Eveniment nou'}
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
                  Șterge eveniment
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="eveniment-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="eveniment-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume eveniment" required htmlFor="nume_eveniment">
            <TextInput
              id="nume_eveniment"
              value={form.nume_eveniment}
              onChange={(e) => set('nume_eveniment')(e.target.value)}
            />
          </Field>
          <Field label="Tip" htmlFor="tip">
            <Select
              id="tip"
              options={tipEvenimentOptions}
              value={form.tip}
              onChange={(e) => set('tip')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descriere" htmlFor="descriere">
          <TextArea
            id="descriere"
            rows={2}
            value={form.descriere}
            onChange={(e) => set('descriere')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" htmlFor="data">
            <TextInput
              id="data"
              type="date"
              value={form.data}
              onChange={(e) => set('data')(e.target.value)}
            />
          </Field>
          <Field label="Locație" htmlFor="locatia">
            <TextInput
              id="locatia"
              value={form.locatia}
              onChange={(e) => set('locatia')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Organizator" htmlFor="organizator">
            <Select
              id="organizator"
              placeholder="—"
              options={teacheri.data ?? []}
              value={form.organizator}
              onChange={(e) => set('organizator')(e.target.value)}
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              placeholder="—"
              options={statusEvenimentOptions}
              value={form.status}
              onChange={(e) => set('status')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Capacitate" htmlFor="capacitate">
            <TextInput
              id="capacitate"
              type="number"
              min={0}
              value={form.capacitate}
              onChange={(e) => set('capacitate')(e.target.value)}
            />
          </Field>
          <Field label="Preț bilet" htmlFor="pret_bilet">
            <TextInput
              id="pret_bilet"
              type="number"
              min={0}
              value={form.pret_bilet}
              onChange={(e) => set('pret_bilet')(e.target.value)}
            />
          </Field>
          <Field label="Cost organizare" htmlFor="cost_organizare">
            <TextInput
              id="cost_organizare"
              type="number"
              min={0}
              value={form.cost_organizare}
              onChange={(e) => set('cost_organizare')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notițe" htmlFor="notite">
          <TextArea
            id="notite"
            rows={2}
            value={form.notite}
            onChange={(e) => set('notite')(e.target.value)}
          />
        </Field>

        <div className="rounded-md border border-quasar-gray-light p-3">
          <Checkbox
            id="eveniment-public"
            label="Afișează biletul pe portalul de membri (/servicii)"
            checked={form.public}
            onChange={(e) => set('public')(e.target.checked)}
          />
          {form.public && (
            <p className="mt-2 text-xs text-quasar-gray">
              Apare pe portal cât timp data e în viitor și statusul nu e „Anulat".
              Se afișează numele, descrierea, data, locația și prețul biletului.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
