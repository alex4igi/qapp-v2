import { humanizeError } from '@/lib/errorMessage'
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
import type { TarifPublic } from '@/types/db'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import {
  listTarifePublice,
  createTarifPublic,
  updateTarifPublic,
  deleteTarifPublic,
} from './api'
import { PreturiReferintaPanel } from './PreturiReferintaPanel'

type FormState = {
  program: string
  descriere: string
  pret: string
  taxa_rezervare: string
  ordine: string
  activ: boolean
}

const empty: FormState = {
  program: '',
  descriere: '',
  pret: '',
  taxa_rezervare: '',
  ordine: '0',
  activ: true,
}

// Oferta publică afișată pe portalul de membri (/servicii). Editabilă de
// manager/admin/owner; restul staff-ului o vede read-only (scrierea e gated și de RLS).
export function TarifePubliceSection() {
  const { role } = useAuth()
  const canEdit = isPrivileged(role)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<TarifPublic | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>(empty)
  const [error, setError] = useState<string | null>(null)

  const tarifeQuery = useQuery({ queryKey: ['tarife_publice'], queryFn: listTarifePublice })

  const columns: Column<TarifPublic>[] = [
    {
      header: 'Ordine',
      cell: (t) => t.ordine,
      className: 'w-16 text-quasar-gray',
      sortValue: (t) => t.ordine ?? 0,
    },
    {
      header: 'Program',
      cell: (t) => (
        <span className="font-medium">
          {t.program}
          {t.descriere ? (
            <span className="block text-xs font-normal text-quasar-gray">{t.descriere}</span>
          ) : null}
        </span>
      ),
      sortValue: (t) => t.program?.toLowerCase(),
    },
    { header: 'Preț', cell: (t) => t.pret, sortValue: (t) => t.pret?.toLowerCase() },
    {
      header: 'Taxă rezervare',
      cell: (t) => t.taxa_rezervare ?? '—',
      className: 'w-32',
      sortValue: (t) => t.taxa_rezervare?.toLowerCase(),
    },
    {
      header: 'Activ',
      cell: (t) => (t.activ ? '✓' : '—'),
      className: 'w-16 text-center',
      sortValue: (t) => (t.activ ? 1 : 0),
    },
  ]

  const open = (t: TarifPublic | null) => {
    if (!canEdit) return
    setEditing(t)
    setForm(
      t
        ? {
            program: t.program,
            descriere: t.descriere ?? '',
            pret: t.pret,
            taxa_rezervare: t.taxa_rezervare ?? '',
            ordine: String(t.ordine),
            activ: t.activ,
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tarife_publice'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        program: form.program.trim(),
        descriere: form.descriere.trim() || null,
        pret: form.pret.trim(),
        taxa_rezervare: form.taxa_rezervare.trim() || null,
        ordine: form.ordine ? Number(form.ordine) : 0,
        activ: form.activ,
      }
      return isEdit ? updateTarifPublic(editing!.id, payload) : createTarifPublic(payload)
    },
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteTarifPublic(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.program.trim()) {
      setError('Numele programului este obligatoriu.')
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
        <h2 className="text-lg font-bold text-quasar-black">Tarife publice</h2>
        {canEdit && <Button onClick={() => open(null)}>+ Tarif</Button>}
      </div>
      <p className="mb-3 text-sm text-quasar-gray">
        Oferta afișată public pe portalul de membri (pagina „Servicii și prețuri"). Modificările apar
        imediat acolo. Nu influențează prețurile de facturare per curs.
      </p>

      {tarifeQuery.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={tarifeQuery.data ?? []}
          rowKey={(t) => t.id}
          onRowClick={canEdit ? open : undefined}
          emptyMessage="Niciun tarif public."
        />
      )}

      <PreturiReferintaPanel />

      {isOpen && (
        <Modal
          open
          title={isEdit ? 'Editează tarif' : 'Tarif nou'}
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
              <Button type="submit" form="tarif-form" disabled={save.isPending}>
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="tarif-form" onSubmit={handleSubmit} className="space-y-3">
            <Field label="Program" required htmlFor="tarif-program">
              <TextInput
                id="tarif-program"
                value={form.program}
                onChange={(e) => set('program')(e.target.value)}
              />
            </Field>
            <Field label="Descriere" htmlFor="tarif-descriere">
              <TextArea
                id="tarif-descriere"
                rows={2}
                value={form.descriere}
                onChange={(e) => set('descriere')(e.target.value)}
              />
            </Field>
            <Field label="Preț" required htmlFor="tarif-pret">
              <TextInput
                id="tarif-pret"
                placeholder="ex. 170 lei/lună"
                value={form.pret}
                onChange={(e) => set('pret')(e.target.value)}
              />
            </Field>
            <Field label="Taxă rezervare" htmlFor="tarif-taxa">
              <TextInput
                id="tarif-taxa"
                placeholder="ex. 50 lei (opțional)"
                value={form.taxa_rezervare}
                onChange={(e) => set('taxa_rezervare')(e.target.value)}
              />
            </Field>
            <Field label="Ordine" htmlFor="tarif-ordine">
              <TextInput
                id="tarif-ordine"
                type="number"
                value={form.ordine}
                onChange={(e) => set('ordine')(e.target.value)}
              />
            </Field>
            <Checkbox
              id="tarif-activ"
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
