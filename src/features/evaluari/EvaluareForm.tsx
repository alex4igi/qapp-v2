import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { teacheriOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import type { Evaluare, InsertDto, UpdateDto } from '@/types/db'
import {
  createEvaluare,
  updateEvaluare,
  deleteEvaluare,
  cursuriByTeacher,
  clientiByCurs,
  getCurrentTeacherId,
} from './api'
import { skills, type SkillKey } from './skills'
import { SkillRating } from './SkillRating'

type Props = {
  open: boolean
  evaluare?: Evaluare | null
  onClose: () => void
}

type FormState = {
  teacher: string
  cursul: string
  client: string
  data_evaluarii: string
  nivel_grupa: string
  feedback_general: string
  skills: Record<SkillKey, number | null>
}

function initialSkills(e?: Evaluare | null): Record<SkillKey, number | null> {
  return skills.reduce(
    (acc, s) => {
      acc[s.key] = (e?.[s.key] as number | null | undefined) ?? null
      return acc
    },
    {} as Record<SkillKey, number | null>,
  )
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EvaluareForm({ open, evaluare, onClose }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isEdit = Boolean(evaluare)
  const isTeacher = role === 'teacher'

  const [form, setForm] = useState<FormState>({
    teacher: evaluare?.teacher ?? '',
    cursul: evaluare?.cursul ?? '',
    client: evaluare?.client ?? '',
    data_evaluarii: evaluare?.data_evaluarii ?? todayIso(),
    nivel_grupa: evaluare?.nivel_grupa ?? '',
    feedback_general: evaluare?.feedback_general ?? '',
    skills: initialSkills(evaluare),
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Teacher id pentru utilizatorul logat (dacă e teacher) — îl fixăm pe form.
  const teacherIdQ = useQuery({
    queryKey: ['evaluari', 'current-teacher-id'],
    queryFn: getCurrentTeacherId,
    enabled: isTeacher,
  })

  useEffect(() => {
    if (isTeacher && teacherIdQ.data && !form.teacher) {
      setForm((p) => ({ ...p, teacher: teacherIdQ.data! }))
    }
  }, [isTeacher, teacherIdQ.data, form.teacher])

  // Liste pentru dropdown-uri.
  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: teacheriOptions,
  })

  const cursuriAllQ = useCursuriOptions({ enabled: !isTeacher && !form.teacher })

  const cursuriByTeacherQ = useQuery({
    queryKey: ['lookup', 'cursuri-by-teacher', form.teacher],
    queryFn: () => cursuriByTeacher(form.teacher),
    enabled: Boolean(form.teacher),
  })

  const cursuriOpts =
    form.teacher
      ? (cursuriByTeacherQ.data ?? [])
      : (cursuriAllQ.data ?? [])

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti-by-curs', form.cursul],
    queryFn: () => clientiByCurs(form.cursul),
    enabled: Boolean(form.cursul),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setSkill = (key: SkillKey, value: number) =>
    setForm((prev) => ({ ...prev, skills: { ...prev.skills, [key]: value } }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['evaluari'] })

  const save = useMutation({
    mutationFn: () => {
      const base = {
        teacher: form.teacher,
        cursul: form.cursul,
        client: form.client,
        data_evaluarii: form.data_evaluarii,
        nivel_grupa: form.nivel_grupa.trim() || null,
        feedback_general: form.feedback_general.trim() || null,
        ...form.skills,
      }
      if (isEdit) {
        return updateEvaluare(evaluare!.id, base as UpdateDto<'evaluari'>)
      }
      return createEvaluare(base as InsertDto<'evaluari'>)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteEvaluare(evaluare!.id),
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
    if (!form.teacher) return setError('Selectează instructorul.')
    if (!form.cursul) return setError('Selectează cursul.')
    if (!form.client) return setError('Selectează cursantul.')
    save.mutate()
  }

  const canDelete =
    isEdit && (isAdminOrHigher(role) || (isTeacher && evaluare?.teacher === teacherIdQ.data))

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează evaluare' : 'Raport evaluare nou'}
      onClose={onClose}
      footer={
        <>
          {canDelete && (
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
                  Șterge evaluarea
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="evaluare-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="evaluare-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Profesor" htmlFor="teacher" required>
            {isTeacher ? (
              <TextInput
                id="teacher"
                value={
                  teacherIdQ.data
                    ? (teacheriQ.data?.find((t) => t.value === teacherIdQ.data)
                        ?.label ?? '— autentificat —')
                    : '— autentificat —'
                }
                disabled
              />
            ) : (
              <Select
                id="teacher"
                placeholder="—"
                options={teacheriQ.data ?? []}
                value={form.teacher}
                onChange={(e) => {
                  set('teacher', e.target.value)
                  set('cursul', '')
                  set('client', '')
                }}
              />
            )}
          </Field>
          <Field label="Data evaluării" htmlFor="data" required>
            <TextInput
              id="data"
              type="date"
              value={form.data_evaluarii}
              onChange={(e) => set('data_evaluarii', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Curs" htmlFor="curs" required>
            <Select
              id="curs"
              placeholder="—"
              options={cursuriOpts}
              value={form.cursul}
              onChange={(e) => {
                set('cursul', e.target.value)
                set('client', '')
              }}
              disabled={isTeacher && !form.teacher}
            />
          </Field>
          <Field label="Cursant" htmlFor="client" required>
            <Select
              id="client"
              placeholder={form.cursul ? '—' : 'Alege cursul mai întâi'}
              options={clientiQ.data ?? []}
              value={form.client}
              onChange={(e) => set('client', e.target.value)}
              disabled={!form.cursul}
            />
          </Field>
        </div>

        <Field label="Nivel grupă (opțional)" htmlFor="nivel">
          <TextInput
            id="nivel"
            placeholder="ex: Tiny, Junior, Varsity…"
            value={form.nivel_grupa}
            onChange={(e) => set('nivel_grupa', e.target.value)}
          />
        </Field>

        <div className="rounded-md bg-quasar-gray-light/40 p-3">
          <p className="mb-2 text-sm font-semibold text-quasar-black">
            Abilități dobândite
          </p>
          <p className="mb-3 text-xs text-quasar-gray">
            Bifează nivelul: 1 = cu foarte mult ajutor, 5 = reușește independent.
          </p>
          <div className="space-y-2">
            {skills.map((s) => (
              <SkillRating
                key={s.key}
                label={s.label}
                value={form.skills[s.key]}
                onChange={(v) => setSkill(s.key, v)}
              />
            ))}
          </div>
        </div>

        <Field label="Feedback general" htmlFor="feedback">
          <TextArea
            id="feedback"
            rows={5}
            placeholder="Comentarii despre progresul cursantului…"
            value={form.feedback_general}
            onChange={(e) => set('feedback_general', e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
