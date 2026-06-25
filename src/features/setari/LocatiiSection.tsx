import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Field,
  TextInput,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { Locatie } from '@/types/db'
import {
  listLocatii,
  createLocatie,
  updateLocatie,
  deleteLocatie,
} from './api'

const columns: Column<Locatie>[] = [
  {
    header: 'Nume',
    cell: (l) => <span className="font-medium">{l.nume}</span>,
    sortValue: (l) => l.nume?.toLowerCase(),
  },
  {
    header: 'Adresă',
    cell: (l) => l.adresa ?? '—',
    sortValue: (l) => l.adresa?.toLowerCase(),
  },
  {
    header: 'Telefon',
    cell: (l) => l.telefon ?? '—',
    className: 'w-32',
    sortValue: (l) => l.telefon,
  },
  {
    header: 'Închidere',
    cell: (l) => (l.ora_inchidere ?? '—').slice(0, 5),
    className: 'w-24',
    sortValue: (l) => l.ora_inchidere,
  },
  {
    header: 'Hartă',
    cell: (l) =>
      l.link_maps ? (
        <a
          href={l.link_maps}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
          onClick={(e) => e.stopPropagation()}
        >
          📍 vezi
        </a>
      ) : (
        '—'
      ),
    className: 'w-24',
  },
]

type FormState = {
  nume: string
  adresa: string
  telefon: string
  link_maps: string
  ora_inchidere: string
}

export function LocatiiSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Locatie | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>({
    nume: '',
    adresa: '',
    telefon: '',
    link_maps: '',
    ora_inchidere: '22:00',
  })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['locatii'],
    queryFn: listLocatii,
  })

  const open = (loc: Locatie | null) => {
    setEditing(loc)
    setForm({
      nume: loc?.nume ?? '',
      adresa: loc?.adresa ?? '',
      telefon: loc?.telefon ?? '',
      link_maps: loc?.link_maps ?? '',
      ora_inchidere: (loc?.ora_inchidere ?? '22:00').slice(0, 5),
    })
    setError(null)
  }
  const close = () => setEditing(undefined)
  const isOpen = editing !== undefined
  const isEdit = Boolean(editing)
  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['locatii'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        adresa: form.adresa.trim() || null,
        telefon: form.telefon.trim() || null,
        link_maps: form.link_maps.trim() || null,
        ora_inchidere: form.ora_inchidere || '22:00',
      }
      return isEdit
        ? updateLocatie(editing!.id, payload)
        : createLocatie(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteLocatie(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Locații</h2>
        <Button onClick={() => open(null)}>+ Locație</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(l) => l.id}
          onRowClick={open}
          emptyMessage="Nicio locație."
        />
      )}

      {isOpen && (
        <Modal
          open
          title={isEdit ? 'Editează locație' : 'Locație nouă'}
          onClose={close}
          footer={
            <>
              {isEdit && (
                <Button
                  variant="danger"
                  className="mr-auto"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Șterge
                </Button>
              )}
              <Button variant="secondary" onClick={close}>
                Anulează
              </Button>
              <Button
                type="submit"
                form="locatie-form"
                disabled={save.isPending}
              >
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="locatie-form" onSubmit={handleSubmit} className="space-y-3">
            <Field label="Nume" required htmlFor="loc-nume">
              <TextInput
                id="loc-nume"
                value={form.nume}
                onChange={(e) => set('nume')(e.target.value)}
              />
            </Field>
            <Field label="Adresă" htmlFor="loc-adresa">
              <TextInput
                id="loc-adresa"
                placeholder="Bdul. Ștefan cel Mare 10, et. 1"
                value={form.adresa}
                onChange={(e) => set('adresa')(e.target.value)}
              />
            </Field>
            <Field label="Telefon" htmlFor="loc-tel">
              <TextInput
                id="loc-tel"
                placeholder="0730 534 172"
                value={form.telefon}
                onChange={(e) => set('telefon')(e.target.value)}
              />
            </Field>
            <Field label="Link Google Maps" htmlFor="loc-maps">
              <TextInput
                id="loc-maps"
                placeholder="https://maps.app.goo.gl/…"
                value={form.link_maps}
                onChange={(e) => set('link_maps')(e.target.value)}
              />
            </Field>
            <Field label="Oră închidere" htmlFor="loc-ora">
              <TextInput
                id="loc-ora"
                type="time"
                value={form.ora_inchidere}
                onChange={(e) => set('ora_inchidere')(e.target.value)}
              />
              <p className="mt-1 text-xs text-quasar-gray">
                Turile de pontaj uitate deschise se închid automat la această oră.
              </p>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
