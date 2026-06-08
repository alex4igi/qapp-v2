import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import type { Sezon } from '@/types/db'
import {
  createSezon,
  deleteSezon,
  listSezoane,
  setSezonActiv,
  updateSezon,
} from '../../api'
import { SezonCloneWizard } from '../../SezonCloneWizard'
import { STARE_CLS, STARE_LABEL, TIP_CLS, type FormState } from './helpers'
import { SezonEditModal } from './SezonEditModal'

export function SezoaneSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Sezon | null | undefined>(undefined)
  const [showWizard, setShowWizard] = useState(false)
  const [form, setForm] = useState<FormState>({
    numele_sezonului: '',
    tip: 'principal',
    data_incepere: '',
    data_final: '',
    scadenta_prima_rata: '',
    scadenta_ultima_rata: '',
  })
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sezoane'],
    queryFn: listSezoane,
  })

  const open = (s: Sezon | null) => {
    setEditing(s)
    setForm({
      numele_sezonului: s?.numele_sezonului ?? '',
      tip: (s?.tip as 'principal' | 'extra') ?? 'principal',
      data_incepere: s?.data_incepere ?? '',
      data_final: s?.data_final ?? '',
      scadenta_prima_rata: s?.scadenta_prima_rata ?? '',
      scadenta_ultima_rata: s?.scadenta_ultima_rata ?? '',
    })
    setError(null)
  }
  const close = () => setEditing(undefined)
  const isOpen = editing !== undefined
  const isEdit = Boolean(editing)
  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value as never }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sezoane'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        numele_sezonului: form.numele_sezonului.trim(),
        tip: form.tip,
        data_incepere: form.data_incepere || null,
        data_final: form.data_final || null,
        scadenta_prima_rata: form.scadenta_prima_rata || null,
        scadenta_ultima_rata: form.scadenta_ultima_rata || null,
      }
      return isEdit ? updateSezon(editing!.id, payload) : createSezon(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteSezon(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const activate = useMutation({
    mutationFn: (id: string) => setSezonActiv(id),
    onSuccess: () => void invalidate(),
  })

  const columns: Column<Sezon>[] = [
    {
      header: 'Sezon',
      cell: (s) => (
        <span className="font-medium">
          {s.numele_sezonului}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
              STARE_CLS[s.stare] ?? STARE_CLS.planificat
            }`}
          >
            {STARE_LABEL[s.stare] ?? s.stare.toUpperCase()}
          </span>
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              TIP_CLS[s.tip] ?? TIP_CLS.principal
            }`}
          >
            {s.tip === 'extra' ? 'EXTRA' : 'PRINCIPAL'}
          </span>
        </span>
      ),
    },
    { header: 'Început', cell: (s) => s.data_incepere ?? '—' },
    { header: 'Final', cell: (s) => s.data_final ?? '—' },
    {
      header: '',
      cell: (s) => {
        if (s.stare === 'activ') {
          return <span className="text-xs text-quasar-gray">sezon activ</span>
        }
        if (s.stare === 'arhivat') {
          return <span className="text-xs text-quasar-gray">arhivat</span>
        }
        return (
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              activate.mutate(s.id)
            }}
          >
            Activează
          </Button>
        )
      },
      className: 'w-40 text-right',
    },
  ]

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.numele_sezonului.trim()) {
      setError('Numele sezonului este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Sezoane</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => open(null)}>
            + Sezon (manual)
          </Button>
          <Button onClick={() => setShowWizard(true)}>+ Sezon prin clonare</Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(s) => s.id}
          onRowClick={open}
          emptyMessage="Niciun sezon."
        />
      )}

      {isOpen && (
        <SezonEditModal
          sezon={editing!}
          form={form}
          set={set}
          error={error}
          isEdit={isEdit}
          isSaving={save.isPending}
          isDeleting={remove.isPending}
          onSubmit={handleSubmit}
          onDelete={() => remove.mutate()}
          onClose={close}
        />
      )}

      {showWizard && (
        <SezonCloneWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            void invalidate()
            setShowWizard(false)
          }}
        />
      )}
    </section>
  )
}
