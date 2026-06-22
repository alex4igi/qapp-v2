import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextArea,
  Select,
  Button,
  Spinner,
} from '@/components/ui'
import type { EvaluareTeacher, InsertDto, UpdateDto } from '@/types/db'
import {
  CRITERII,
  scorMediu,
  listEvaluariTeacher,
  createEvaluareTeacher,
  updateEvaluareTeacher,
  deleteEvaluareTeacher,
} from './evaluariTeacherApi'

const RO_LUNI = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

const LUNA_OPTS = RO_LUNI.map((l, i) => ({ value: String(i + 1), label: l }))

function yearOpts(): { value: string; label: string }[] {
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let y = now + 1; y >= now - 3; y--) years.push(y)
  return years.map((y) => ({ value: String(y), label: String(y) }))
}

// Rând de notare 1–5 (Slab → Excelent).
function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="mb-2 text-sm font-medium text-quasar-black">{label}</p>
      <div className="flex items-center gap-3 text-xs text-quasar-gray">
        <span className="w-16 shrink-0 text-right">Slab</span>
        <div className="flex flex-1 items-center justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`Nivel ${n}`}
              className={[
                'h-8 w-8 rounded-full border text-sm font-medium transition-colors',
                value === n
                  ? 'border-quasar-black bg-quasar-yellow text-quasar-black'
                  : 'border-gray-200 bg-white text-quasar-gray hover:border-quasar-black',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="w-16 shrink-0">Excelent</span>
      </div>
    </div>
  )
}

type ScoreKey =
  | 'scor_punctualitate'
  | 'scor_pregatire'
  | 'scor_energie'
  | 'scor_comunicare'
  | 'scor_disciplina'
  | 'scor_rezultate'
  | 'feedback_cursanti'

type FormState = {
  luna: number
  anul: number
  scores: Record<ScoreKey, number | null>
  observatii: string
}

const ALL_SCORE_KEYS: ScoreKey[] = [
  ...CRITERII.map((c) => c.key),
  'feedback_cursanti',
]

function initialForm(e?: EvaluareTeacher | null): FormState {
  const now = new Date()
  const scores = ALL_SCORE_KEYS.reduce(
    (acc, k) => {
      acc[k] = (e?.[k] as number | null | undefined) ?? null
      return acc
    },
    {} as Record<ScoreKey, number | null>,
  )
  return {
    luna: e?.luna ?? now.getMonth() + 1,
    anul: e?.anul ?? now.getFullYear(),
    scores,
    observatii: e?.observatii ?? '',
  }
}

function EvaluareTeacherForm({
  teacherId,
  evaluare,
  onClose,
}: {
  teacherId: string
  evaluare: EvaluareTeacher | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(evaluare)
  const [form, setForm] = useState<FormState>(() => initialForm(evaluare))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setScore = (key: ScoreKey, value: number) =>
    setForm((p) => ({ ...p, scores: { ...p.scores, [key]: value } }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['evaluari-teacher', teacherId] })

  const save = useMutation({
    mutationFn: () => {
      const base = {
        teacher_id: teacherId,
        luna: form.luna,
        anul: form.anul,
        observatii: form.observatii.trim() || null,
        ...form.scores,
      }
      if (isEdit) {
        return updateEvaluareTeacher(
          evaluare!.id,
          base as UpdateDto<'evaluari_teacher'>,
        )
      }
      return createEvaluareTeacher(base as InsertDto<'evaluari_teacher'>)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Eroare la salvare.'
      setError(
        /duplicate|unique/i.test(msg)
          ? 'Există deja o evaluare pentru luna selectată.'
          : msg,
      )
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteEvaluareTeacher(evaluare!.id),
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
    save.mutate()
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editează evaluarea' : 'Evaluare profesor nouă'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">Confirmi ștergerea?</span>
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
          <Button type="submit" form="evaluare-teacher-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="evaluare-teacher-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Luna" htmlFor="luna" required>
            <Select
              id="luna"
              options={LUNA_OPTS}
              value={String(form.luna)}
              onChange={(e) => setForm((p) => ({ ...p, luna: Number(e.target.value) }))}
              disabled={isEdit}
            />
          </Field>
          <Field label="An" htmlFor="anul" required>
            <Select
              id="anul"
              options={yearOpts()}
              value={String(form.anul)}
              onChange={(e) => setForm((p) => ({ ...p, anul: Number(e.target.value) }))}
              disabled={isEdit}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="mb-1 text-sm font-semibold text-quasar-black">Criterii</p>
          <p className="mb-3 text-xs text-quasar-gray">
            Notează 1 = slab, 5 = excelent. Lasă gol ce nu se aplică.
          </p>
          <div className="space-y-2">
            {CRITERII.map((c) => (
              <RatingRow
                key={c.key}
                label={c.label}
                value={form.scores[c.key]}
                onChange={(v) => setScore(c.key, v)}
              />
            ))}
            <RatingRow
              label="Feedback cursanți (introdus manual de manager)"
              value={form.scores.feedback_cursanti}
              onChange={(v) => setScore('feedback_cursanti', v)}
            />
          </div>
        </div>

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            rows={4}
            placeholder="Comentarii despre performanța instructorului…"
            value={form.observatii}
            onChange={(e) => setForm((p) => ({ ...p, observatii: e.target.value }))}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

export function TeacherTabEvaluari({ teacherId }: { teacherId: string }) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EvaluareTeacher | null>(null)

  const q = useQuery({
    queryKey: ['evaluari-teacher', teacherId],
    queryFn: () => listEvaluariTeacher(teacherId),
  })

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (e: EvaluareTeacher) => {
    setEditing(e)
    setFormOpen(true)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-quasar-gray">
          Evaluări lunare (vizibile doar managementului)
        </p>
        <Button onClick={openNew}>+ Evaluare nouă</Button>
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="text-sm text-red-600">Eroare la încărcarea evaluărilor.</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-quasar-gray shadow-sm">
          Nicio evaluare încă. Apasă „+ Evaluare nouă".
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-quasar-gray">
              <tr>
                <th className="px-4 py-2 font-medium">Perioadă</th>
                <th className="px-4 py-2 font-medium">Scor mediu</th>
                <th className="px-4 py-2 font-medium">Observații</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((e) => {
                const sm = scorMediu(e)
                return (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                    onClick={() => openEdit(e)}
                  >
                    <td className="px-4 py-2 font-medium text-quasar-black">
                      {RO_LUNI[e.luna - 1]} {e.anul}
                    </td>
                    <td className="px-4 py-2">
                      {sm != null ? `${sm} / 5` : '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-quasar-gray">
                      {e.observatii || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <EvaluareTeacherForm
          teacherId={teacherId}
          evaluare={editing}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  )
}
