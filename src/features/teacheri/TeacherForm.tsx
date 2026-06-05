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
import { nivelTeacherOptions, marimeTricouOptions } from '@/lib/enums'
import type { Teacher } from '@/types/db'
import { createTeacher, updateTeacher } from './api'

type Props = {
  open: boolean
  teacher?: Teacher | null
  onClose: () => void
}

type FormState = {
  nume: string
  prenume: string
  data_nasterii: string
  telefon: string
  email: string
  nivelul: string
  marime_tricou: string
  link_contract: string
  observatii: string
}

function initialState(teacher?: Teacher | null): FormState {
  return {
    nume: teacher?.nume ?? '',
    prenume: teacher?.prenume ?? '',
    data_nasterii: teacher?.data_nasterii ?? '',
    telefon: teacher?.telefon ?? '',
    email: teacher?.email ?? '',
    nivelul: teacher?.nivelul ?? '',
    marime_tricou: teacher?.marime_tricou ?? '',
    link_contract: teacher?.link_contract ?? '',
    observatii: teacher?.observatii ?? '',
  }
}

export function TeacherForm({ open, teacher, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(teacher)
  const [form, setForm] = useState<FormState>(() => initialState(teacher))
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nume: form.nume.trim(),
        prenume: form.prenume.trim() || null,
        data_nasterii: form.data_nasterii || null,
        telefon: form.telefon.trim() || null,
        email: form.email.trim() || null,
        nivelul: (form.nivelul || null) as Teacher['nivelul'],
        marime_tricou: (form.marime_tricou || null) as Teacher['marime_tricou'],
        link_contract: form.link_contract.trim() || null,
        observatii: form.observatii.trim() || null,
      }
      return isEdit
        ? updateTeacher(teacher!.id, payload)
        : createTeacher(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacheri'] })
      if (isEdit) {
        void queryClient.invalidateQueries({
          queryKey: ['teacher', teacher!.id],
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
    if (!form.nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează teacher' : 'Teacher nou'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="teacher-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume" required htmlFor="nume">
            <TextInput
              id="nume"
              value={form.nume}
              onChange={(e) => set('nume')(e.target.value)}
            />
          </Field>
          <Field label="Prenume" htmlFor="prenume">
            <TextInput
              id="prenume"
              value={form.prenume}
              onChange={(e) => set('prenume')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon" htmlFor="telefon">
            <TextInput
              id="telefon"
              value={form.telefon}
              onChange={(e) => set('telefon')(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data nașterii" htmlFor="data_nasterii">
            <TextInput
              id="data_nasterii"
              type="date"
              value={form.data_nasterii}
              onChange={(e) => set('data_nasterii')(e.target.value)}
            />
          </Field>
          <Field label="Nivel" htmlFor="nivelul">
            <Select
              id="nivelul"
              placeholder="—"
              options={nivelTeacherOptions}
              value={form.nivelul}
              onChange={(e) => set('nivelul')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mărime tricou" htmlFor="marime">
            <Select
              id="marime"
              placeholder="—"
              options={marimeTricouOptions}
              value={form.marime_tricou}
              onChange={(e) => set('marime_tricou')(e.target.value)}
            />
          </Field>
          <Field label="Link contract" htmlFor="link_contract">
            <TextInput
              id="link_contract"
              value={form.link_contract}
              onChange={(e) => set('link_contract')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            value={form.observatii}
            onChange={(e) => set('observatii')(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
