import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { ChecklistRail } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import {
  TEACHER_CHECKLIST,
  type SectiuneTeacher,
} from '@/lib/checklist/specs/teacher'
import { nivelTeacherOptions, marimeTricouOptions } from '@/lib/enums'
import type { Teacher } from '@/types/db'
import { createTeacher, updateTeacher } from './api'
import {
  buildTeacherPayload,
  initialState,
  teacherCheckInput,
  type FormState,
} from './helpers'

type Props = {
  open: boolean
  teacher?: Teacher | null
  onClose: () => void
  onCreated?: (teacher: Teacher) => void
  /** Deschide formularul derulat la secțiunea unui câmp lipsă (din checklist). */
  focusSection?: SectiuneTeacher
}

export function TeacherForm({
  open,
  teacher,
  onClose,
  onCreated,
  focusSection,
}: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(teacher)
  const [form, setForm] = useState<FormState>(() => initialState(teacher))
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const checklist = useMemo(
    () => evalueazaChecklist(TEACHER_CHECKLIST, teacherCheckInput(form, teacher)),
    [form, teacher],
  )

  // Deschidere din checklistul fișei: derulează direct la secțiunea câmpului lipsă.
  useEffect(() => {
    if (!open || !focusSection) return
    bodyRef.current
      ?.querySelector(`[data-sectiune="${focusSection}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, focusSection])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = buildTeacherPayload(form)
      return isEdit
        ? updateTeacher(teacher!.id, payload)
        : createTeacher(payload)
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['teacheri'] })
      void queryClient.invalidateQueries({ queryKey: ['fise-incomplete'] })
      if (isEdit) {
        void queryClient.invalidateQueries({
          queryKey: ['teacher', teacher!.id],
        })
      } else {
        onCreated?.(saved)
      }
      onClose()
    },
    onError: (e: unknown) => {
      setError(humanizeError(e, 'Eroare la salvare.'))
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
      size="xl"
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
      <div
        ref={bodyRef}
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]"
      >
        <form
          id="teacher-form"
          onSubmit={handleSubmit}
          className="min-w-0 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3" data-sectiune="identitate">
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

          <div className="grid grid-cols-2 gap-3" data-sectiune="contact">
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

          <div className="grid grid-cols-2 gap-3" data-sectiune="hr">
            <Field label="Data nașterii" htmlFor="data_nasterii">
              <DateInput
                id="data_nasterii"
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

          <div data-sectiune="altele" className="space-y-3">
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
          </div>

          {/* Avertisment NON-BLOCANT: lipsa esențialelor nu oprește salvarea. */}
          {checklist.lipsaEsentiale.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ Necompletate:{' '}
              {checklist.lipsaEsentiale.map((s) => s.eticheta).join(', ')}. Poți
              salva oricum — instructorul rămâne marcat ca fișă incompletă.
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
        <ChecklistRail rezultat={checklist} />
      </div>
    </Modal>
  )
}
