import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { tipEvenimentOptions } from '@/lib/enums'
import { locatiiOptions } from '@/lib/lookups'
import { supabase } from '@/lib/supabase'
import type { Eveniment } from '@/types/db'
import { createEveniment, updateEveniment, deleteEveniment } from './api'

// Formular redus pentru evenimente de grupă (spectacol, antrenament în parc) —
// creat de teacher de pe pagina grupei. Fără preț/bilete/public: evenimentele
// de grupă sunt pur informative (garantat și de RLS + constraint-uri DB).
type Props = {
  open: boolean
  cursId: string
  eveniment?: Eveniment | null
  onClose: () => void
}

type FormState = {
  nume_eveniment: string
  tip: string
  descriere: string
  data: string
  ora: string
  locatie_id: string
  locatia: string
  notite: string
  status: string
}

const ALTA_LOCATIE = '__alta__'

function initialState(e?: Eveniment | null): FormState {
  return {
    nume_eveniment: e?.nume_eveniment ?? '',
    tip: e?.tip ?? 'Eveniment',
    descriere: e?.descriere ?? '',
    data: e?.data ?? '',
    ora: e?.ora ?? '',
    locatie_id: e?.locatie_id ?? '',
    locatia: e?.locatia ?? '',
    notite: e?.notite ?? '',
    status: e?.status ?? 'Urmator',
  }
}

const STATUS_OPTIONS = [
  { value: 'Urmator', label: 'Urmator' },
  { value: 'Anulat', label: 'Anulat' },
]

export function EvenimentGrupaForm({ open, cursId, eveniment, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(eveniment)
  const [form, setForm] = useState<FormState>(() => initialState(eveniment))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Locația se alege din `locatii`; textul liber rămâne doar pentru ce se ține
  // în afara studiourilor (parc, teatru, sală de spectacol).
  const locatii = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const [locatieAlta, setLocatieAlta] = useState(
    () => !eveniment?.locatie_id && Boolean(eveniment?.locatia?.trim()),
  )
  const locatieNume =
    (locatii.data ?? []).find((o) => o.value === form.locatie_id)?.label ?? ''

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['evenimente'] })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nume_eveniment: form.nume_eveniment.trim(),
        tip: form.tip as Eveniment['tip'],
        descriere: form.descriere.trim() || null,
        data: form.data,
        ora: form.ora.trim() || null,
        locatia: (locatieAlta ? form.locatia.trim() : locatieNume) || null,
        locatie_id: (locatieAlta ? '' : form.locatie_id) || null,
        notite: form.notite.trim() || null,
        status: form.status as Eveniment['status'],
        curs: cursId,
        public: false,
      }
      if (isEdit) return updateEveniment(eveniment!.id, payload)
      const { data: teacherId } = await supabase.rpc('current_teacher_id')
      return createEveniment({
        ...payload,
        organizator: (teacherId as string | null) ?? null,
      })
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteEveniment(eveniment!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume_eveniment.trim()) {
      setError('Numele evenimentului este obligatoriu.')
      return
    }
    if (!form.data) {
      setError('Data este obligatorie — evenimentul apare în calendarul membrilor.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează evenimentul grupei' : 'Eveniment de grupă'}
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
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
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
          <Button type="submit" form="eveniment-grupa-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="eveniment-grupa-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume eveniment" required htmlFor="eg-nume">
            <TextInput
              id="eg-nume"
              value={form.nume_eveniment}
              onChange={(e) => set('nume_eveniment')(e.target.value)}
            />
          </Field>
          <Field label="Tip" htmlFor="eg-tip">
            <Select
              id="eg-tip"
              options={tipEvenimentOptions}
              value={form.tip}
              onChange={(e) => set('tip')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descriere" htmlFor="eg-descriere">
          <TextArea
            id="eg-descriere"
            rows={2}
            value={form.descriere}
            onChange={(e) => set('descriere')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Data" required htmlFor="eg-data">
            <DateInput
              id="eg-data"
              value={form.data}
              onChange={(e) => set('data')(e.target.value)}
            />
          </Field>
          <Field label="Ora" htmlFor="eg-ora">
            <TextInput
              id="eg-ora"
              type="time"
              value={form.ora}
              onChange={(e) => set('ora')(e.target.value)}
            />
          </Field>
          <Field label="Locație" htmlFor="eg-locatie">
            <Select
              id="eg-locatie"
              placeholder="—"
              options={[
                ...(locatii.data ?? []),
                { value: ALTA_LOCATIE, label: 'Altă locație…' },
              ]}
              value={locatieAlta ? ALTA_LOCATIE : form.locatie_id}
              onChange={(e) => {
                const v = e.target.value
                setLocatieAlta(v === ALTA_LOCATIE)
                if (v !== ALTA_LOCATIE) set('locatie_id')(v)
              }}
            />
          </Field>
        </div>

        {locatieAlta && (
          <Field label="Numele locației" htmlFor="eg-locatia">
            <TextInput
              id="eg-locatia"
              placeholder="Ex: Parcul Copou, Teatrul Național…"
              value={form.locatia}
              onChange={(e) => set('locatia')(e.target.value)}
            />
          </Field>
        )}

        {isEdit && (
          <Field label="Status" htmlFor="eg-status">
            <Select
              id="eg-status"
              options={STATUS_OPTIONS}
              value={form.status}
              onChange={(e) => set('status')(e.target.value)}
            />
          </Field>
        )}

        <Field label="Notițe" htmlFor="eg-notite">
          <TextArea
            id="eg-notite"
            rows={2}
            value={form.notite}
            onChange={(e) => set('notite')(e.target.value)}
          />
        </Field>

        <p className="text-xs text-quasar-gray">
          Evenimentul apare în calendarul din portalul de membri, doar pentru
          cursanții acestei grupe.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
