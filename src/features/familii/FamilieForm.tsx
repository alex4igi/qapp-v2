import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Checkbox,
  Button,
} from '@/components/ui'
import type { Familie } from '@/types/db'
import { createFamilie, updateFamilie } from './api'

type Props = {
  open: boolean
  familie?: Familie | null
  onClose: () => void
}

type FormState = {
  nume_familie: string
  nume_reprezentant: string
  prenume_reprezentant: string
  email: string
  telefon: string
  telefon_2: string
  metoda_plata: string
  metoda_comunicare: string
  observatii: string
  doreste_sa_apara_in_poze: boolean
}

function initialState(familie?: Familie | null): FormState {
  return {
    nume_familie: familie?.nume_familie ?? '',
    nume_reprezentant: familie?.nume_reprezentant ?? '',
    prenume_reprezentant: familie?.prenume_reprezentant ?? '',
    email: familie?.email ?? '',
    telefon: familie?.telefon ?? '',
    telefon_2: familie?.telefon_2 ?? '',
    metoda_plata: familie?.metoda_plata ?? '',
    metoda_comunicare: familie?.metoda_comunicare ?? '',
    observatii: familie?.observatii ?? '',
    doreste_sa_apara_in_poze: familie?.doreste_sa_apara_in_poze ?? false,
  }
}

export function FamilieForm({ open, familie, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(familie)
  const [form, setForm] = useState<FormState>(() => initialState(familie))
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nume_familie: form.nume_familie.trim(),
        nume_reprezentant: form.nume_reprezentant.trim() || null,
        prenume_reprezentant: form.prenume_reprezentant.trim() || null,
        email: form.email.trim() || null,
        telefon: form.telefon.trim() || null,
        telefon_2: form.telefon_2.trim() || null,
        metoda_plata: form.metoda_plata.trim() || null,
        metoda_comunicare: form.metoda_comunicare.trim() || null,
        observatii: form.observatii.trim() || null,
        doreste_sa_apara_in_poze: form.doreste_sa_apara_in_poze,
      }
      return isEdit
        ? updateFamilie(familie!.id, payload)
        : createFamilie(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['familii'] })
      if (isEdit) {
        void queryClient.invalidateQueries({
          queryKey: ['familie', familie!.id],
        })
      }
      onClose()
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Eroare la salvare.')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume_familie.trim()) {
      setError('Numele familiei este obligatoriu.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează familie' : 'Familie nouă'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="familie-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="familie-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nume familie" required htmlFor="nume_familie">
          <TextInput
            id="nume_familie"
            value={form.nume_familie}
            onChange={(e) => set('nume_familie', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume reprezentant" htmlFor="nume_rep">
            <TextInput
              id="nume_rep"
              value={form.nume_reprezentant}
              onChange={(e) => set('nume_reprezentant', e.target.value)}
            />
          </Field>
          <Field label="Prenume reprezentant" htmlFor="prenume_rep">
            <TextInput
              id="prenume_rep"
              value={form.prenume_reprezentant}
              onChange={(e) => set('prenume_reprezentant', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon" htmlFor="telefon">
            <TextInput
              id="telefon"
              value={form.telefon}
              onChange={(e) => set('telefon', e.target.value)}
            />
          </Field>
          <Field label="Telefon 2" htmlFor="telefon2">
            <TextInput
              id="telefon2"
              value={form.telefon_2}
              onChange={(e) => set('telefon_2', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Metodă plată" htmlFor="metoda_plata">
            <TextInput
              id="metoda_plata"
              value={form.metoda_plata}
              onChange={(e) => set('metoda_plata', e.target.value)}
            />
          </Field>
          <Field label="Metodă comunicare" htmlFor="metoda_com">
            <TextInput
              id="metoda_com"
              value={form.metoda_comunicare}
              onChange={(e) => set('metoda_comunicare', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            value={form.observatii}
            onChange={(e) => set('observatii', e.target.value)}
          />
        </Field>

        <Checkbox
          id="poze"
          label="Dorește să apară în poze"
          checked={form.doreste_sa_apara_in_poze}
          onChange={(e) =>
            set('doreste_sa_apara_in_poze', e.target.checked)
          }
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
