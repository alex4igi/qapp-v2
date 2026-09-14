import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Field,
  TextInput,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { capacitateGrupaOptionsCu } from '@/lib/capacitateGrupa'
import type { Sala } from '@/types/db'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { listSali, listLocatii, createSala, updateSala, deleteSala } from './api'

type FormState = {
  nume: string
  locatie: string
  capacitate: string
  minimCursanti: string
}

const MINIM_CURSANTI_STANDARD = 8

export function SaliSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Sala | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>({
    nume: '',
    locatie: '',
    capacitate: '',
    minimCursanti: String(MINIM_CURSANTI_STANDARD),
  })
  const [error, setError] = useState<string | null>(null)

  const { locatieId: workingLocatieId } = useWorkingLocatie()
  const saliQuery = useQuery({ queryKey: ['sali'], queryFn: listSali })
  const filteredSali = useMemo(() => {
    const rows = saliQuery.data ?? []
    if (!workingLocatieId) return rows
    return rows.filter((s) => s.locatie === workingLocatieId)
  }, [saliQuery.data, workingLocatieId])
  const locatiiQuery = useQuery({
    queryKey: ['locatii'],
    queryFn: listLocatii,
  })

  const locatiiById = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of locatiiQuery.data ?? []) map.set(l.id, l.nume)
    return map
  }, [locatiiQuery.data])

  const locatieOptions = useMemo(
    () =>
      (locatiiQuery.data ?? []).map((l) => ({
        label: l.nume,
        value: l.id,
      })),
    [locatiiQuery.data],
  )

  const columns: Column<Sala>[] = [
    {
      header: 'Sală',
      cell: (s) => <span className="font-medium">{s.nume}</span>,
      sortValue: (s) => s.nume?.toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (s) => (s.locatie ? (locatiiById.get(s.locatie) ?? '—') : '—'),
      sortValue: (s) =>
        s.locatie ? locatiiById.get(s.locatie)?.toLowerCase() : undefined,
    },
    {
      header: 'Capacitate',
      cell: (s) => s.capacitate ?? '—',
      className: 'w-28',
      sortValue: (s) => s.capacitate ?? 0,
    },
    {
      header: 'Minim cursanți',
      cell: (s) => s.minim_cursanti,
      className: 'w-32',
      sortValue: (s) => s.minim_cursanti,
    },
  ]

  const open = (s: Sala | null) => {
    setEditing(s)
    setForm({
      nume: s?.nume ?? '',
      locatie: s?.locatie ?? '',
      capacitate: s?.capacitate != null ? String(s.capacitate) : '',
      minimCursanti: String(s?.minim_cursanti ?? MINIM_CURSANTI_STANDARD),
    })
    setError(null)
  }
  const close = () => setEditing(undefined)
  const isOpen = editing !== undefined
  const isEdit = Boolean(editing)
  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sali'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        locatie: form.locatie || null,
        capacitate: form.capacitate ? Number(form.capacitate) : null,
        minim_cursanti: Number(form.minimCursanti),
      }
      return isEdit ? updateSala(editing!.id, payload) : createSala(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteSala(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele sălii este obligatoriu.')
      return
    }
    const minim = Number(form.minimCursanti)
    if (!Number.isInteger(minim) || minim < 1 || minim > 30) {
      setError('Minimul de cursanți trebuie să fie un număr între 1 și 30.')
      return
    }
    save.mutate()
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Săli</h2>
        <Button onClick={() => open(null)}>+ Sală</Button>
      </div>

      {saliQuery.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredSali}
          rowKey={(s) => s.id}
          onRowClick={open}
          emptyMessage="Nicio sală."
        />
      )}

      {isOpen && (
        <Modal
          open
          title={isEdit ? 'Editează sală' : 'Sală nouă'}
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
                form="sala-form"
                disabled={save.isPending}
              >
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="sala-form" onSubmit={handleSubmit} className="space-y-3">
            <Field label="Nume sală" required htmlFor="sala-nume">
              <TextInput
                id="sala-nume"
                value={form.nume}
                onChange={(e) => set('nume')(e.target.value)}
              />
            </Field>
            <Field label="Locație" htmlFor="sala-loc">
              <Select
                id="sala-loc"
                placeholder="—"
                options={locatieOptions}
                value={form.locatie}
                onChange={(e) => set('locatie')(e.target.value)}
              />
            </Field>
            {/* Capacitatea sălii e treapta implicită a grupelor ținute acolo,
                deci se alege din aceleași trepte ca mărimea grupei. */}
            <Field label="Capacitate" htmlFor="sala-cap">
              <Select
                id="sala-cap"
                placeholder="—"
                options={capacitateGrupaOptionsCu(form.capacitate)}
                value={form.capacitate}
                onChange={(e) => set('capacitate')(e.target.value)}
              />
            </Field>
            <Field label="Minim cursanți pe grupă" htmlFor="sala-minim">
              <TextInput
                id="sala-minim"
                type="number"
                min={1}
                max={30}
                value={form.minimCursanti}
                onChange={(e) => set('minimCursanti')(e.target.value)}
              />
              <p className="mt-1 text-xs text-quasar-gray">
                Sub acest număr 3 luni la rând, grupa e propusă pentru suspendare.
              </p>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
