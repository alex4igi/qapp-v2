import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Field,
  Modal,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextInput,
  type Column,
} from '@/components/ui'
import {
  AUDIENTE,
  CATEGORII,
  ROLURI,
  createKb,
  deleteKb,
  listKb,
  updateKb,
  type QbotKbRow,
} from './api'

type FormState = {
  audienta: string
  categorie: string
  titlu: string
  continut: string
  rol_necesar: string
  pagina: string
  activ: boolean
}

const EMPTY: FormState = {
  audienta: 'staff',
  categorie: 'workflow',
  titlu: '',
  continut: '',
  rol_necesar: '',
  pagina: '',
  activ: true,
}

export function QbotKbPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['qbot-kb'], queryFn: listKb })

  const [editing, setEditing] = useState<QbotKbRow | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [err, setErr] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!form.titlu.trim() || !form.continut.trim()) {
        throw new Error('Titlul și conținutul sunt obligatorii.')
      }
      const dto = {
        audienta: form.audienta,
        categorie: form.categorie,
        titlu: form.titlu.trim(),
        continut: form.continut.trim(),
        rol_necesar: form.rol_necesar || null,
        pagina: form.pagina.trim() || null,
        activ: form.activ,
      }
      if (editing) await updateKb(editing.id, dto)
      else await createKb(dto)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qbot-kb'] })
      setOpen(false)
    },
    onError: (e) => setErr((e as Error).message),
  })

  const del = useMutation({
    mutationFn: (id: string) => deleteKb(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qbot-kb'] }),
  })

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setErr(null)
    setOpen(true)
  }

  function openEdit(row: QbotKbRow) {
    setEditing(row)
    setForm({
      audienta: row.audienta,
      categorie: row.categorie,
      titlu: row.titlu,
      continut: row.continut,
      rol_necesar: row.rol_necesar ?? '',
      pagina: row.pagina ?? '',
      activ: row.activ,
    })
    setErr(null)
    setOpen(true)
  }

  const columns: Column<QbotKbRow>[] = useMemo(
    () => [
      { header: 'Audiență', cell: (r) => r.audienta, className: 'w-24' },
      { header: 'Categorie', cell: (r) => r.categorie, className: 'w-28' },
      { header: 'Titlu', cell: (r) => r.titlu },
      { header: 'Rol', cell: (r) => r.rol_necesar ?? '—', className: 'w-24' },
      { header: 'Pagină', cell: (r) => r.pagina ?? '—', className: 'w-32' },
      {
        header: 'Activ',
        cell: (r) => (r.activ ? '✅' : '—'),
        className: 'w-16 text-center',
      },
      {
        header: '',
        className: 'w-28',
        cell: (r) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                openEdit(r)
              }}
            >
              ✎
            </Button>
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Ștergi „${r.titlu}"?`)) del.mutate(r.id)
              }}
            >
              🗑
            </Button>
          </div>
        ),
      },
    ],
    [del],
  )

  return (
    <div>
      <PageHeader
        title="Q-bot — bază de cunoștințe"
        subtitle="Ghiduri, proceduri, politici și contracte pe care Q-bot le folosește la răspunsuri."
        actions={<Button onClick={openNew}>+ Intrare nouă</Button>}
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          onRowClick={openEdit}
          emptyMessage="Nicio intrare. Adaugă prima."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'Editează intrarea' : 'Intrare nouă'}
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Anulează
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Audiență" required>
              <Select
                value={form.audienta}
                onChange={(e) => setForm({ ...form, audienta: e.target.value })}
                options={AUDIENTE.map((v) => ({ label: v, value: v }))}
              />
            </Field>
            <Field label="Categorie" required>
              <Select
                value={form.categorie}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                options={CATEGORII.map((v) => ({ label: v, value: v }))}
              />
            </Field>
          </div>
          <Field label="Titlu" required>
            <TextInput
              value={form.titlu}
              onChange={(e) => setForm({ ...form, titlu: e.target.value })}
              placeholder="ex: Mutarea unui client între grupe"
            />
          </Field>
          <Field label="Conținut" required>
            <TextArea
              rows={6}
              value={form.continut}
              onChange={(e) => setForm({ ...form, continut: e.target.value })}
              placeholder="Explicația / procedura, în română."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rol necesar (opțional)">
              <Select
                value={form.rol_necesar}
                onChange={(e) => setForm({ ...form, rol_necesar: e.target.value })}
                placeholder="— oricine —"
                options={ROLURI.map((v) => ({ label: v, value: v }))}
              />
            </Field>
            <Field label="Pagină (opțional)">
              <TextInput
                value={form.pagina}
                onChange={(e) => setForm({ ...form, pagina: e.target.value })}
                placeholder="ex: /plati"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activ}
              onChange={(e) => setForm({ ...form, activ: e.target.checked })}
            />
            Activ (vizibil pentru Q-bot)
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </Modal>
    </div>
  )
}
