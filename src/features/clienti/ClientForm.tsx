import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  Select,
  Combobox,
  Checkbox,
  Pills,
  Button,
} from '@/components/ui'
import {
  sexOptions,
  statusClientOptions,
  marimeTricouOptions,
} from '@/lib/enums'
import { ChecklistRail } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import {
  CLIENT_CHECKLIST,
  type SectiuneClient,
} from '@/lib/checklist/specs/client'
import { familiiOptions, unitatiInvatamantOptions } from '@/lib/lookups'
import { recordAuditLog } from '@/lib/auditLog'
import type { Client } from '@/types/db'
import { createClient, updateClient } from './api'
import { createFamilie } from '@/features/familii/api'

// Câmpurile de client al căror schimb merită urmă în audit (date personale).
const AUDITED_FIELDS = [
  'nume', 'prenume', 'email', 'telefon', 'telefonul_2', 'data_nasterii',
  'sexul', 'status', 'marime_tricou', 'familia',
  'unitate_invatamant', 'fara_poze',
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
  /** Documentele vin din embed-ul listei/profilului — le folosește doar
   *  previzualizarea de checklist (itemul „Contract" nu se editează aici). */
  client?: (Client & { documente?: { tip: string }[] }) | null
  onClose: () => void
  /** Deschide formularul derulat la secțiunea unui câmp lipsă (din checklist). */
  focusSection?: SectiuneClient
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
  familia: string
  unitate_invatamant: string
  fara_poze: boolean
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
    // Clientul nou intră direct „Activ" — statusul se schimbă doar din fișă,
    // iar listele („Fișe incomplete", datorii) filtrează pe 'Activ'.
    status: client?.status ?? 'Activ',
    marime_tricou: client?.marime_tricou ?? '',
    familia: client?.familia ?? '',
    unitate_invatamant: client?.unitate_invatamant ?? '',
    fara_poze: client?.fara_poze ?? false,
  }
}

// Validare telefon permisivă: acceptăm orice format care conține minim 7 cifre
// (07xx xxx xxx, +40..., +33..., paranteze, spații, cratime — toate ok).
function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length
}

export function ClientForm({ open, client, onClose, focusSection }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(client)
  const [form, setForm] = useState<FormState>(() => initialState(client))
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Draftul acoperă toate câmpurile editabile aici; itemul „Contract" vine din
  // documentele deja salvate (se adaugă din tabul Documente, nu din formular).
  const checklist = useMemo(
    () =>
      evalueazaChecklist(CLIENT_CHECKLIST, {
        nume: form.nume.trim(),
        prenume: form.prenume.trim() || null,
        telefon: form.telefon.trim() || null,
        email: form.email.trim() || null,
        data_nasterii: form.data_nasterii || null,
        familia: form.familia || null,
        // Contractul nu se editează aici — se citește din documentele salvate.
        documente: client?.documente ?? [],
      }),
    [form, client],
  )

  // Deschidere din checklistul fișei: derulează la secțiunea câmpului lipsă.
  useEffect(() => {
    if (!open || !focusSection) return
    bodyRef.current
      ?.querySelector(`[data-sectiune="${focusSection}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, focusSection])
  const [newFamilieOpen, setNewFamilieOpen] = useState(false)
  const [newFamilieName, setNewFamilieName] = useState('')

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const familiiQ = useQuery({
    queryKey: ['lookup', 'familii'],
    queryFn: familiiOptions,
  })

  const unitatiQ = useQuery({
    queryKey: ['lookup', 'unitati-invatamant'],
    queryFn: unitatiInvatamantOptions,
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
        familia: form.familia || null,
        unitate_invatamant: form.unitate_invatamant.trim() || null,
        fara_poze: form.fara_poze,
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
      setError(humanizeError(e, 'Eroare la salvare.'))
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
      size="xl"
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
      <div
        ref={bodyRef}
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]"
      >
      <form id="client-form" onSubmit={handleSubmit} className="min-w-0 space-y-3">
        <div className="grid grid-cols-2 gap-3" data-sectiune="identitate">
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

        <div data-sectiune="contact" className="space-y-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3" data-sectiune="personale">
          <Field label="Data nașterii" htmlFor="data_nasterii">
            <DateInput
              id="data_nasterii"
              picker="wheel"
              value={form.data_nasterii}
              onChange={(e) => set('data_nasterii')(e.target.value)}
            />
          </Field>
          <Field label="Sex">
            <Pills
              aria-label="Sex"
              options={sexOptions}
              value={form.sexul}
              onChange={set('sexul')}
              className="h-[38px]"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Statusul apare doar la editare — un client nou e „Activ" prin definiție. */}
          {isEdit && (
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                placeholder="—"
                options={statusClientOptions}
                value={form.status}
                onChange={(e) => set('status')(e.target.value)}
              />
            </Field>
          )}
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

        <div data-sectiune="familie">
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
        </div>

        {/* Catalog, nu text liber: altfel aceeași școală intră în zeci de forme
            și nu se mai poate centraliza. Ce nu e în listă se poate adăuga pe
            loc — DB-ul normalizează numele și marchează intrarea „de verificat". */}
        <Field label="Unitatea de învățământ" htmlFor="unitate_invatamant">
          <Combobox
            id="unitate_invatamant"
            placeholder="Caută școala / liceul (tastează pentru a căuta)"
            options={unitatiQ.data ?? []}
            value={form.unitate_invatamant}
            onChange={set('unitate_invatamant')}
            allowCustom
          />
        </Field>

        {/* Refuzul se moștenește de la familie dacă e bifat acolo — aici e
            doar overrideul pe copil. Se vede ca iconiță în rosterul grupei. */}
        <Checkbox
          id="fara_poze"
          label="Nu dorește să apară în poze (refuz GDPR)"
          checked={form.fara_poze}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, fara_poze: e.target.checked }))
          }
        />

        {/* Avertisment NON-BLOCANT: lipsa esențialelor nu oprește salvarea. */}
        {checklist.lipsaEsentiale.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠️ Necompletate:{' '}
            {checklist.lipsaEsentiale.map((s) => s.eticheta).join(', ')}. Poți
            salva oricum — clientul rămâne marcat ca fișă incompletă.
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <ChecklistRail rezultat={checklist} />
      </div>
    </Modal>
  )
}
