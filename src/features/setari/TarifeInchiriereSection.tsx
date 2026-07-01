import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState, type FormEvent } from 'react'
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
import type { Sala, TarifInchiriere } from '@/types/db'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import {
  listSali,
  listTarifeInchiriere,
  upsertTarifInchiriere,
} from './api'

// Grila de tarife pentru închirierea sălilor: per sală × tier (staff/client) ×
// treaptă (60/90/120 + increment peste 120). Vizibilă doar în Setări (PRIVILEGED).
type BracketForm = { pret_60: string; pret_90: string; pret_120: string; increment_30: string }
const EMPTY: BracketForm = { pret_60: '', pret_90: '', pret_120: '', increment_30: '' }

function toForm(t: TarifInchiriere | undefined): BracketForm {
  if (!t) return { ...EMPTY }
  return {
    pret_60: t.pret_60 != null ? String(t.pret_60) : '',
    pret_90: t.pret_90 != null ? String(t.pret_90) : '',
    pret_120: t.pret_120 != null ? String(t.pret_120) : '',
    increment_30: t.increment_30 != null ? String(t.increment_30) : '',
  }
}

const num = (v: string): number | null => {
  const n = Number(v)
  return v.trim() && Number.isFinite(n) ? n : null
}

export function TarifeInchiriereSection() {
  const queryClient = useQueryClient()
  const { locatieId: workingLocatieId } = useWorkingLocatie()
  const [editing, setEditing] = useState<Sala | null>(null)
  const [staff, setStaff] = useState<BracketForm>({ ...EMPTY })
  const [client, setClient] = useState<BracketForm>({ ...EMPTY })
  const [error, setError] = useState<string | null>(null)

  const saliQ = useQuery({ queryKey: ['sali'], queryFn: listSali })
  const tarifeQ = useQuery({
    queryKey: ['tarife-inchiriere'],
    queryFn: listTarifeInchiriere,
  })

  const filteredSali = useMemo(() => {
    const rows = saliQ.data ?? []
    return workingLocatieId ? rows.filter((s) => s.locatie === workingLocatieId) : rows
  }, [saliQ.data, workingLocatieId])

  const tarifFor = (salaId: string, tier: 'staff' | 'client') =>
    tarifeQ.data?.find((t) => t.sala === salaId && t.tier === tier)

  const fmtBracket = (t: TarifInchiriere | undefined) =>
    t && (t.pret_60 != null || t.pret_90 != null || t.pret_120 != null)
      ? `${t.pret_60 ?? '—'} / ${t.pret_90 ?? '—'} / ${t.pret_120 ?? '—'} (+${t.increment_30 ?? '—'}/30)`
      : '— nesetat'

  const columns: Column<Sala>[] = [
    {
      header: 'Sală',
      cell: (s) => <span className="font-medium">{s.nume}</span>,
      sortValue: (s) => s.nume?.toLowerCase(),
    },
    {
      header: 'Staff (60/90/120)',
      cell: (s) => fmtBracket(tarifFor(s.id, 'staff')),
    },
    {
      header: 'Client (60/90/120)',
      cell: (s) => fmtBracket(tarifFor(s.id, 'client')),
    },
  ]

  const open = (s: Sala) => {
    setEditing(s)
    setStaff(toForm(tarifFor(s.id, 'staff')))
    setClient(toForm(tarifFor(s.id, 'client')))
    setError(null)
  }
  const close = () => setEditing(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return
      await upsertTarifInchiriere({
        sala: editing.id,
        tier: 'staff',
        pret_60: num(staff.pret_60),
        pret_90: num(staff.pret_90),
        pret_120: num(staff.pret_120),
        increment_30: num(staff.increment_30),
      })
      await upsertTarifInchiriere({
        sala: editing.id,
        tier: 'client',
        pret_60: num(client.pret_60),
        pret_90: num(client.pret_90),
        pret_120: num(client.pret_120),
        increment_30: num(client.increment_30),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tarife-inchiriere'] })
      close()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  const bracketFields = (
    label: string,
    val: BracketForm,
    set: (v: BracketForm) => void,
  ) => (
    <div className="rounded-md border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {(['pret_60', 'pret_90', 'pret_120', 'increment_30'] as const).map((k) => (
          <Field
            key={k}
            label={k === 'increment_30' ? '+30 min' : `${k.replace('pret_', '')} min`}
          >
            <TextInput
              type="number"
              min={0}
              step="1"
              value={val[k]}
              onChange={(e) => set({ ...val, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </div>
  )

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-quasar-black">Tarife închiriere săli</h2>
        <p className="text-sm text-quasar-gray">
          Preț per sală × tier (Staff / Client) × durată. Peste 120 min = preț 120 +
          increment/30 min. Sală fără tarif → nu se poate rezerva.
        </p>
      </div>

      {saliQ.isLoading || tarifeQ.isLoading ? (
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

      {editing && (
        <Modal
          open
          title={`Tarife — ${editing.nume}`}
          onClose={close}
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Anulează
              </Button>
              <Button type="submit" form="tarif-inchiriere-form" disabled={save.isPending}>
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="tarif-inchiriere-form" onSubmit={handleSubmit} className="space-y-3">
            {bracketFields('Staff & crews', staff, setStaff)}
            {bracketFields('Clienți', client, setClient)}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
