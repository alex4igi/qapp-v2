import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  Select,
  Combobox,
  Button,
} from '@/components/ui'
import {
  sexOptions,
  statusClientOptions,
  marimeTricouOptions,
} from '@/lib/enums'
import { familiiOptions } from '@/lib/lookups'
import { recordAuditLog } from '@/lib/auditLog'
import type { Client } from '@/types/db'
import { createClient, updateClient } from './api'
import { createFamilie } from '@/features/familii/api'

// Câmpurile de client al căror schimb merită urmă în audit (date personale).
const AUDITED_FIELDS = [
  'nume', 'prenume', 'email', 'telefon', 'telefonul_2', 'data_nasterii',
  'sexul', 'status', 'marime_tricou', 'link_contract', 'familia',
  'unitate_invatamant',
] as const

// Diferența între clientul existent și payload-ul nou, doar pe câmpurile auditate.
function clientChanges(prev: Client, next: Record<string, unknown>) {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const f of AUDITED_FIELDS) {
    const oldV = (prev as Record<string, unknown>)[f] ?? null
    const newV = next[f] ?? null
    if (oldV !== newV) {
      before[f] = oldV
      after[f] = newV
    }
  }
  return { before, after, changed: Object.keys(after).length > 0 }
}

type Props = {
  open: boolean
  client?: Client | null
  onClose: () => void
}

type FormState = {
  nume: string
  prenume: string
  email: string
  telefon: string
  telefonul_2: string
  data_nasterii: string
  sexul: string
  status: string
  marime_tricou: string
  link_contract: string
  familia: string
  unitate_invatamant: string
}

function initialState(client?: Client | null): FormState {
  return {
    nume: client?.nume ?? '',
    prenume: client?.prenume ?? '',
    email: client?.email ?? '',
    telefon: client?.telefon ?? '',
    telefonul_2: client?.telefonul_2 ?? '',
    data_nasterii: client?.data_nasterii ?? '',
    sexul: client?.sexul ?? '',
    status: client?.status ?? '',
    marime_tricou: client?.marime_tricou ?? '',
    link_contract: client?.link_contract ?? '',
    familia: client?.familia ?? '',
    unitate_invatamant: client?.unitate_invatamant ?? '',
  }
}

// Validare telefon permisivă: acceptăm orice format care conține minim 7 cifre
// (07xx xxx xxx, +40..., +33..., paranteze, spații, cratime — toate ok).
function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length
}

export function ClientForm({ open, client, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(client)
  const [form, setForm] = useState<FormState>(() => initialState(client))
  const [error, setError] = useState<string | null>(null)
  const [newFamilieOpen, setNewFamilieOpen] = useState(false)
  const [newFamilieName, setNewFamilieName] = useState('')

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const familiiQ = useQuery({
    queryKey: ['lookup', 'familii'],
    queryFn: familiiOptions,
  })

  const createFamilieMut = useMutation({
    mutationFn: (nume: string) => createFamilie({ nume_familie: nume }),
    onSuccess: (fam) => {
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'familii'] })
      void queryClient.invalidateQueries({ queryKey: ['familii'] })
      set('familia')(fam.id)
      setNewFamilieOpen(false)
      setNewFamilieName('')
      setError(null)
    },
    onError: (e: unknown) =>
      setError(
        e instanceof Error
          ? `Nu am putut crea familia: ${e.message}`
          : 'Nu am putut crea familia.',
      ),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nume: form.nume.trim(),
        prenume: form.prenume.trim(),
        email: form.email.trim() || null,
        telefon: form.telefon.trim(),
        telefonul_2: form.telefonul_2.trim() || null,
        data_nasterii: form.data_nasterii || null,
        sexul: (form.sexul || null) as Client['sexul'],
        status: (form.status || null) as Client['status'],
        marime_tricou: (form.marime_tricou || null) as Client['marime_tricou'],
        link_contract: form.link_contract.trim() || null,
        familia: form.familia || null,
        unitate_invatamant: form.unitate_invatamant.trim() || null,
      }
      if (!isEdit) return createClient(payload)

      const updated = await updateClient(client!.id, payload)
      // Audit pe modificarea datelor clientului (front_desk inclus). Non-blocant:
      // dacă logarea eșuează, salvarea a reușit deja.
      const diff = clientChanges(client!, payload)
      if (diff.changed) {
        try {
          await recordAuditLog({
            action: 'client_data_changed',
            entityType: 'client',
            entityId: client!.id,
            oldValue: diff.before,
            newValue: diff.after,
          })
        } catch (e) {
          console.error('audit client_data_changed eșuat:', e)
        }
      }
      return updated
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clienti'] })
      if (isEdit) {
        void queryClient.invalidateQueries({
          queryKey: ['client', client!.id],
        })
        void queryClient.invalidateQueries({
          queryKey: ['client-familia'],
        })
      }
      // dacă mutăm un client între familii, refresh și familiile vizate
      void queryClient.invalidateQueries({ queryKey: ['familie'] })
      onClose()
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Eroare la salvare.')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    if (!form.prenume.trim()) {
      setError('Prenumele este obligatoriu.')
      return
    }
    const tel = form.telefon.trim()
    if (!tel) {
      setError('Telefonul este obligatoriu.')
      return
    }
    if (countDigits(tel) < 7) {
      setError('Telefonul trebuie să conțină minim 7 cifre (ex: 0741 234 567 sau +33 6 12 34 56 78).')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează client' : 'Client nou'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="client-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume" required htmlFor="nume">
            <TextInput
              id="nume"
              value={form.nume}
              onChange={(e) => set('nume')(e.target.value)}
            />
          </Field>
          <Field label="Prenume" required htmlFor="prenume">
            <TextInput
              id="prenume"
              value={form.prenume}
              onChange={(e) => set('prenume')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon" required htmlFor="telefon">
            <TextInput
              id="telefon"
              placeholder="07xx xxx xxx sau +33 ..."
              value={form.telefon}
              onChange={(e) => set('telefon')(e.target.value)}
            />
          </Field>
          <Field label="Telefon 2" htmlFor="telefon2">
            <TextInput
              id="telefon2"
              value={form.telefonul_2}
              onChange={(e) => set('telefonul_2')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data nașterii" htmlFor="data_nasterii">
            <TextInput
              id="data_nasterii"
              type="date"
              value={form.data_nasterii}
              onChange={(e) => set('data_nasterii')(e.target.value)}
            />
          </Field>
          <Field label="Sex" htmlFor="sexul">
            <Select
              id="sexul"
              placeholder="—"
              options={sexOptions}
              value={form.sexul}
              onChange={(e) => set('sexul')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              placeholder="—"
              options={statusClientOptions}
              value={form.status}
              onChange={(e) => set('status')(e.target.value)}
            />
          </Field>
          <Field label="Mărime tricou" htmlFor="marime">
            <Select
              id="marime"
              placeholder="—"
              options={marimeTricouOptions}
              value={form.marime_tricou}
              onChange={(e) => set('marime_tricou')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Familie" htmlFor="familia">
          {newFamilieOpen ? (
            <div className="flex gap-2">
              <TextInput
                id="familia-noua"
                placeholder="Nume familie"
                value={newFamilieName}
                onChange={(e) => setNewFamilieName(e.target.value)}
                autoFocus
              />
              <Button
                type="button"
                onClick={() =>
                  newFamilieName.trim() &&
                  createFamilieMut.mutate(newFamilieName.trim())
                }
                disabled={
                  createFamilieMut.isPending || !newFamilieName.trim()
                }
              >
                {createFamilieMut.isPending ? '…' : 'Creează'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNewFamilieOpen(false)
                  setNewFamilieName('')
                }}
              >
                ✕
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Combobox
                id="familia"
                placeholder="— fără familie — (tastează pentru a căuta)"
                options={familiiQ.data ?? []}
                value={form.familia}
                onChange={(v) => set('familia')(v)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNewFamilieOpen(true)}
              >
                + Familie nouă
              </Button>
            </div>
          )}
        </Field>

        <Field label="Unitatea de învățământ" htmlFor="unitate_invatamant">
          <TextInput
            id="unitate_invatamant"
            placeholder="Școala / liceul unde învață"
            value={form.unitate_invatamant}
            onChange={(e) => set('unitate_invatamant')(e.target.value)}
          />
        </Field>

        <Field label="Link contract" htmlFor="link_contract">
          <TextInput
            id="link_contract"
            value={form.link_contract}
            onChange={(e) => set('link_contract')(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
