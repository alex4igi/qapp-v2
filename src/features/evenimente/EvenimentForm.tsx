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
  Checkbox,
  Button,
} from '@/components/ui'
import { statusEvenimentOptions, tipEvenimentOptions } from '@/lib/enums'
import { teacheriOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import type { Eveniment } from '@/types/db'
import { createEveniment, updateEveniment, deleteEveniment } from './api'

type Props = {
  open: boolean
  eveniment?: Eveniment | null
  onClose: () => void
  /** Apelat la ștergere (în loc de onClose), ca apelantul să navigheze altundeva
   *  — ex. rosterul evenimentului nu mai are ce afișa. */
  onDeleted?: () => void
}

type FormState = {
  nume_eveniment: string
  tip: string
  descriere: string
  data: string
  ora: string
  locatia: string
  organizator: string
  capacitate: string
  pret_bilet: string
  status: string
  notite: string
  public: boolean
  curs: string
}

function initialState(e?: Eveniment | null): FormState {
  return {
    nume_eveniment: e?.nume_eveniment ?? '',
    tip: e?.tip ?? 'Eveniment',
    descriere: e?.descriere ?? '',
    data: e?.data ?? '',
    ora: e?.ora ?? '',
    locatia: e?.locatia ?? '',
    organizator: e?.organizator ?? '',
    capacitate: e?.capacitate != null ? String(e.capacitate) : '',
    pret_bilet: e?.pret_bilet != null ? String(e.pret_bilet) : '',
    status: e?.status ?? '',
    notite: e?.notite ?? '',
    public: e?.public ?? false,
    curs: e?.curs ?? '',
  }
}

const toNum = (s: string) => (s.trim() ? Number(s) : null)

export function EvenimentForm({ open, eveniment, onClose, onDeleted }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(eveniment)
  const [form, setForm] = useState<FormState>(() => initialState(eveniment))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', eveniment?.organizator ?? null],
    queryFn: () => teacheriOptions(null, { includeId: eveniment?.organizator }),
  })
  // Toate grupele sezonului activ, indiferent de locația de lucru.
  const cursuri = useCursuriOptions({ locatieId: null })
  const isGrupa = Boolean(form.curs)

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
        ora: form.ora.trim() || null,
        locatia: form.locatia.trim() || null,
        organizator: form.organizator || null,
        capacitate: toNum(form.capacitate),
        pret_bilet: form.curs ? null : toNum(form.pret_bilet),
        status: (form.status || null) as Eveniment['status'],
        notite: form.notite.trim() || null,
        public: form.curs ? false : form.public,
        curs: form.curs || null,
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
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteEveniment(eveniment!.id),
    onSuccess: () => {
      void invalidate()
      ;(onDeleted ?? onClose)()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la ștergere.')),
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
    if (form.curs && !form.data) {
      setError('Un eveniment de grupă are nevoie de o dată — apare în calendarul membrilor.')
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

        <div className="grid grid-cols-3 gap-3">
          <Field label="Data" htmlFor="data">
            <DateInput
              id="data"
              value={form.data}
              onChange={(e) => set('data')(e.target.value)}
            />
          </Field>
          <Field label="Ora" htmlFor="ora">
            <TextInput
              id="ora"
              type="time"
              value={form.ora}
              onChange={(e) => set('ora')(e.target.value)}
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

        <Field label="Grupă (opțional — eveniment exclusiv grupei)" htmlFor="curs">
          <Select
            id="curs"
            placeholder="— eveniment pentru tot studioul —"
            options={cursuri.data ?? []}
            value={form.curs}
            onChange={(e) => set('curs')(e.target.value)}
          />
        </Field>
        {isGrupa && (
          <p className="text-xs text-quasar-gray">
            Vizibil în calendarul portalului doar pentru cursanții grupei.
            Informativ — fără bilete și fără afișare pe /servicii.
          </p>
        )}

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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacitate" htmlFor="capacitate">
            <TextInput
              id="capacitate"
              type="number"
              min={0}
              value={form.capacitate}
              onChange={(e) => set('capacitate')(e.target.value)}
            />
          </Field>
          {!isGrupa && (
            <Field label="Preț bilet" htmlFor="pret_bilet">
              <TextInput
                id="pret_bilet"
                type="number"
                min={0}
                value={form.pret_bilet}
                onChange={(e) => set('pret_bilet')(e.target.value)}
              />
            </Field>
          )}
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
            checked={isGrupa ? false : form.public}
            disabled={isGrupa}
            onChange={(e) => set('public')(e.target.checked)}
          />
          {isGrupa && (
            <p className="mt-2 text-xs text-quasar-gray">
              Evenimentele de grupă nu se afișează pe /servicii.
            </p>
          )}
          {!isGrupa && form.public && (
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
