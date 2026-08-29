import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Combobox,
  Button,
} from '@/components/ui'
import { cursuriOptions, teacheriOptions } from '@/lib/lookups'
import type { SpectacolAct } from '@/types/db'
import { createAct, updateAct, deleteAct } from './api'

type Props = {
  open: boolean
  spectacolId: string
  // Ordinea implicită a actului nou (la finalul lineup-ului).
  nextOrdine: number
  act?: SpectacolAct | null
  onClose: () => void
}

type FormState = {
  titlu: string
  curs: string
  durata_min: string
  responsabil: string
  note: string
}

function initialState(a?: SpectacolAct | null): FormState {
  return {
    titlu: a?.titlu ?? '',
    curs: a?.curs ?? '',
    durata_min: a?.durata_min != null ? String(a.durata_min) : '',
    responsabil: a?.responsabil ?? '',
    note: a?.note ?? '',
  }
}

export function ActForm({
  open,
  spectacolId,
  nextOrdine,
  act,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(act)
  const [form, setForm] = useState<FormState>(() => initialState(act))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Toate cursurile (fără filtru de sezon/locație) — un act poate proveni din orice
  // grupă/trupă. locatieId: null = toate locațiile; sezonId implicit null via lookup.
  const cursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri', 'all-spectacole'],
    queryFn: () => cursuriOptions(null, null),
  })
  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri', 'all', act?.responsabil ?? null],
    queryFn: () => teacheriOptions(null, { includeId: act?.responsabil }),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['spectacol-lineup', spectacolId] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        spectacol: spectacolId,
        titlu: form.titlu.trim(),
        curs: form.curs || null,
        durata_min: form.durata_min.trim() ? Number(form.durata_min) : null,
        responsabil: form.responsabil || null,
        note: form.note.trim() || null,
      }
      return isEdit
        ? updateAct(act!.id, payload)
        : createAct({ ...payload, ordine: nextOrdine })
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteAct(act!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.titlu.trim()) {
      setError('Titlul actului este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează act' : 'Act nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">Confirmi?</span>
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
                  Șterge act
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="act-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="act-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Titlu act / număr" required htmlFor="titlu">
          <TextInput
            id="titlu"
            value={form.titlu}
            onChange={(e) => setForm((p) => ({ ...p, titlu: e.target.value }))}
          />
        </Field>

        <Field label="Grupă / trupă sursă" htmlFor="curs">
          <Combobox
            id="curs"
            options={cursuriQ.data ?? []}
            value={form.curs}
            onChange={(v) => setForm((p) => ({ ...p, curs: v }))}
            placeholder="— fără grupă —"
          />
          <p className="mt-1 text-xs text-quasar-gray">
            Din ea poți pre-popula performerii actului.
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Durată (min)" htmlFor="durata_min">
            <TextInput
              id="durata_min"
              type="number"
              min={0}
              value={form.durata_min}
              onChange={(e) =>
                setForm((p) => ({ ...p, durata_min: e.target.value }))
              }
            />
          </Field>
          <Field label="Responsabil" htmlFor="responsabil">
            <Combobox
              id="responsabil"
              options={teacheriQ.data ?? []}
              value={form.responsabil}
              onChange={(v) => setForm((p) => ({ ...p, responsabil: v }))}
              placeholder="— fără —"
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="note">
          <TextArea
            id="note"
            rows={2}
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
