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
import type { Sala } from '@/types/db'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { listSali, listLocatii, createSala, updateSala, deleteSala } from './api'

type FormState = {
  nume: string
  locatie: string
  capacitate: string
}

export function SaliSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Sala | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>({
    nume: '',
    locatie: '',
    capacitate: '',
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
    },
    {
      header: 'Locație',
      cell: (s) => (s.locatie ? (locatiiById.get(s.locatie) ?? '—') : '—'),
    },
    {
      header: 'Capacitate',
      cell: (s) => s.capacitate ?? '—',
      className: 'w-28',
    },
  ]

  const open = (s: Sala | null) => {
    setEditing(s)
    setForm({
      nume: s?.nume ?? '',
      locatie: s?.locatie ?? '',
      capacitate: s?.capacitate != null ? String(s.capacitate) : '',
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
      }
      return isEdit ? updateSala(editing!.id, payload) : createSala(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteSala(editing!.id),
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
      setError('Numele sălii este obligatoriu.')
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
            <Field label="Capacitate" htmlFor="sala-cap">
              <TextInput
                id="sala-cap"
                type="number"
                min={0}
                value={form.capacitate}
                onChange={(e) => set('capacitate')(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
