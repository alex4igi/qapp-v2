import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Field,
  TextInput,
  TextArea,
  Checkbox,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { ProdusPublic } from '@/types/db'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import {
  listProdusePublice,
  createProdusPublic,
  updateProdusPublic,
  deleteProdusPublic,
} from './api'

type FormState = {
  nume: string
  descriere: string
  pret: string
  ordine: string
  activ: boolean
}

const empty: FormState = {
  nume: '',
  descriere: '',
  pret: '',
  ordine: '0',
  activ: true,
}

// Listă informativă de produse (merchandise) afișată public pe portalul de membri
// (/servicii) — justifică CAEN-ul secundar pentru Netopia. Editabilă de owner/admin;
// restul staff-ului o vede read-only (scrierea e gated și de RLS).
export function ProdusePubliceSection() {
  const { role } = useAuth()
  const canEdit = isAdminOrHigher(role)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ProdusPublic | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>(empty)
  const [error, setError] = useState<string | null>(null)

  const produseQuery = useQuery({ queryKey: ['produse_publice'], queryFn: listProdusePublice })

  const columns: Column<ProdusPublic>[] = [
    {
      header: 'Ordine',
      cell: (p) => p.ordine,
      className: 'w-16 text-quasar-gray',
    },
    {
      header: 'Produs',
      cell: (p) => (
        <span className="font-medium">
          {p.nume}
          {p.descriere ? (
            <span className="block text-xs font-normal text-quasar-gray">{p.descriere}</span>
          ) : null}
        </span>
      ),
    },
    { header: 'Preț', cell: (p) => p.pret },
    {
      header: 'Activ',
      cell: (p) => (p.activ ? '✓' : '—'),
      className: 'w-16 text-center',
    },
  ]

  const open = (p: ProdusPublic | null) => {
    if (!canEdit) return
    setEditing(p)
    setForm(
      p
        ? {
            nume: p.nume,
            descriere: p.descriere ?? '',
            pret: p.pret,
            ordine: String(p.ordine),
            activ: p.activ,
          }
        : empty,
    )
    setError(null)
  }
  const close = () => setEditing(undefined)
  const isOpen = editing !== undefined
  const isEdit = Boolean(editing)
  const set = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['produse_publice'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        nume: form.nume.trim(),
        descriere: form.descriere.trim() || null,
        pret: form.pret.trim(),
        ordine: form.ordine ? Number(form.ordine) : 0,
        activ: form.activ,
      }
      return isEdit ? updateProdusPublic(editing!.id, payload) : createProdusPublic(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteProdusPublic(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele produsului este obligatoriu.')
      return
    }
    if (!form.pret.trim()) {
      setError('Prețul este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Produse publice</h2>
        {canEdit && <Button onClick={() => open(null)}>+ Produs</Button>}
      </div>
      <p className="mb-3 text-sm text-quasar-gray">
        Articole (merchandise) afișate informativ pe portalul de membri (pagina „Servicii și
        prețuri"). Modificările apar imediat acolo. Listare informativă — fără vânzare online.
      </p>

      {produseQuery.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={produseQuery.data ?? []}
          rowKey={(p) => p.id}
          onRowClick={canEdit ? open : undefined}
          emptyMessage="Niciun produs public."
        />
      )}

      {isOpen && (
        <Modal
          open
          title={isEdit ? 'Editează produs' : 'Produs nou'}
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
              <Button type="submit" form="produs-form" disabled={save.isPending}>
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="produs-form" onSubmit={handleSubmit} className="space-y-3">
            <Field label="Produs" required htmlFor="produs-nume">
              <TextInput
                id="produs-nume"
                value={form.nume}
                onChange={(e) => set('nume')(e.target.value)}
              />
            </Field>
            <Field label="Descriere" htmlFor="produs-descriere">
              <TextArea
                id="produs-descriere"
                rows={2}
                value={form.descriere}
                onChange={(e) => set('descriere')(e.target.value)}
              />
            </Field>
            <Field label="Preț" required htmlFor="produs-pret">
              <TextInput
                id="produs-pret"
                placeholder="ex. 75 lei"
                value={form.pret}
                onChange={(e) => set('pret')(e.target.value)}
              />
            </Field>
            <Field label="Ordine" htmlFor="produs-ordine">
              <TextInput
                id="produs-ordine"
                type="number"
                value={form.ordine}
                onChange={(e) => set('ordine')(e.target.value)}
              />
            </Field>
            <Checkbox
              id="produs-activ"
              label="Afișat public"
              checked={form.activ}
              onChange={(e) => set('activ')(e.target.checked)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
