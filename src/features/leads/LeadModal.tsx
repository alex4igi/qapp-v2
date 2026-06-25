import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { campaniiOptions } from '@/lib/lookups'
import type { Lead } from '@/types/db'
import {
  ALL_STATUS_COLUMNS,
  SUB_STATUS_OPTIONS,
  INTERESE,
  GRUPE,
  GRUPA_LABELS,
  LOCATII,
} from './constants'
import {
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  checkDuplicateTelefon,
  type LeadForm,
} from './api'
import { waLink } from '@/lib/phone'
import { waLeadMessage } from './constants'
import { LeadHistory } from './LeadHistory'
import { LogContactModal } from './LogContactModal'
import { OptOutSection } from '@/features/opt-out/OptOutSection'

type Props = {
  open: boolean
  lead?: Lead | null
  defaultStatus?: string
  onClose: () => void
  /** Deschide fluxul de (re)programare — sincronizează programarea în roster
   *  + retrimite confirmarea. Editarea directă a câmpului de mai jos NU face asta. */
  onReschedule?: (lead: Lead) => void
}

const EMPTY: LeadForm = {
  prenume: '',
  nume: '',
  nume_parinte: '',
  telefon: '',
  email: '',
  data_nasterii: '',
  sursa: '',
  interes: '',
  grupa_varsta: '',
  status: 'nou',
  sub_status: '',
  motiv_pierdut: '',
  locatia: '',
  data_programare: '',
  data_callback_dorit: '',
  observatii: '',
}

function fromLead(lead: Lead): LeadForm {
  return {
    prenume: lead.prenume ?? '',
    nume: lead.nume,
    nume_parinte: lead.nume_parinte ?? '',
    telefon: lead.telefon ?? '',
    email: lead.email ?? '',
    data_nasterii: lead.data_nasterii ?? '',
    sursa: lead.sursa ?? '',
    interes: lead.interes ?? '',
    grupa_varsta: lead.grupa_varsta ?? '',
    status: lead.status,
    sub_status: lead.sub_status ?? '',
    motiv_pierdut: lead.motiv_pierdut ?? '',
    locatia: lead.locatia ?? '',
    data_programare: lead.data_programare
      ? lead.data_programare.slice(0, 10)
      : '',
    data_callback_dorit: lead.data_callback_dorit
      ? lead.data_callback_dorit.slice(0, 16)
      : '',
    observatii: lead.observatii ?? '',
  }
}

export function LeadModal({ open, lead, defaultStatus, onClose, onReschedule }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isEdit = Boolean(lead)
  const [form, setForm] = useState<LeadForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'detalii' | 'istoric'>('detalii')
  const [showLogContact, setShowLogContact] = useState(false)

  const campanii = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })

  useEffect(() => {
    if (!open) return
    setForm(
      lead
        ? fromLead(lead)
        : { ...EMPTY, status: (defaultStatus as LeadForm['status']) ?? 'nou' },
    )
    setError(null)
    setDupWarning(null)
    setConfirmDelete(false)
    setTab('detalii')
  }, [open, lead, defaultStatus])

  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const checkDup = useCallback(
    async (telefon: string) => {
      if (!telefon.trim()) return
      const res = await checkDuplicateTelefon(telefon, lead?.id)
      if (res.duplicate && res.lead) {
        const name = [res.lead.prenume, res.lead.nume]
          .filter(Boolean)
          .join(' ')
        setDupWarning(`Telefon existent: ${name}`)
      }
    },
    [lead?.id],
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['leads'] })

  const save = useMutation({
    mutationFn: () =>
      isEdit ? updateLead(lead!.id, form) : createLead(form),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteLead(lead!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  // Mutare rapidă în Nurture (pool de reactivare). Folosește updateLeadStatus —
  // calea ușoară, fără a cere formularul complet valid (ex: lead fără sursă).
  const moveToNurture = useMutation({
    mutationFn: () => updateLeadStatus(lead!.id, 'nurture'),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la mutare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    if (!form.telefon.trim()) {
      setError('Telefonul este obligatoriu.')
      return
    }
    if (!form.sursa) {
      setError('Sursa (campania) este obligatorie.')
      return
    }
    save.mutate()
  }

  return (
    <>
    <Modal
      open={open}
      title={isEdit ? 'Editare lead' : 'Lead nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && isAdminOrHigher(role) && tab === 'detalii' && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">
                    Confirmi ștergerea?
                  </span>
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Șterge
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Nu
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Șterge lead
                </Button>
              )}
            </div>
          )}
          {isEdit && lead && tab === 'detalii' && (
            <>
              {waLink(form.telefon) && (
                <a
                  href={waLink(form.telefon, waLeadMessage(form))!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  WhatsApp
                </a>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowLogContact(true)}
              >
                📞 Loghează contact
              </Button>
              {lead.status !== 'nurture' && (
                <Button
                  variant="secondary"
                  disabled={moveToNurture.isPending}
                  onClick={() => moveToNurture.mutate()}
                >
                  {moveToNurture.isPending ? 'Se mută…' : '🌱 Mută în Nurture'}
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            {tab === 'istoric' ? 'Închide' : 'Anulează'}
          </Button>
          {tab === 'detalii' && (
            <Button type="submit" form="lead-form" disabled={save.isPending}>
              {save.isPending
                ? 'Se salvează…'
                : isEdit
                  ? 'Salvează'
                  : 'Adaugă lead'}
            </Button>
          )}
        </>
      }
    >
      {isEdit && lead && (
        <div className="mb-3 flex gap-1 border-b border-quasar-gray-light">
          {(['detalii', 'istoric'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors ${
                tab === t
                  ? 'border-quasar-yellow font-medium text-quasar-black'
                  : 'border-transparent text-quasar-gray hover:text-quasar-black'
              }`}
            >
              {t === 'detalii' ? 'Detalii' : 'Istoric'}
            </button>
          ))}
        </div>
      )}

      {isEdit && lead && tab === 'istoric' && (
        <LeadHistory leadId={lead.id} />
      )}

      <form
        id="lead-form"
        onSubmit={handleSubmit}
        className={tab === 'istoric' ? 'hidden' : 'space-y-3'}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prenume" htmlFor="prenume">
            <TextInput
              id="prenume"
              value={form.prenume}
              onChange={(e) => set('prenume', e.target.value)}
            />
          </Field>
          <Field label="Nume" required htmlFor="nume">
            <TextInput
              id="nume"
              value={form.nume}
              onChange={(e) => set('nume', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Telefon"
            required
            htmlFor="telefon"
            error={dupWarning ?? undefined}
          >
            <TextInput
              id="telefon"
              value={form.telefon}
              onChange={(e) => {
                set('telefon', e.target.value)
                setDupWarning(null)
              }}
              onBlur={(e) => void checkDup(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume părinte" htmlFor="nume_parinte">
            <TextInput
              id="nume_parinte"
              value={form.nume_parinte}
              onChange={(e) => set('nume_parinte', e.target.value)}
            />
          </Field>
          <Field label="Data nașterii" htmlFor="data_nasterii">
            <DateInput
              id="data_nasterii"
              value={form.data_nasterii}
              onChange={(e) => set('data_nasterii', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sursă (campanie)" required htmlFor="sursa">
            <Select
              id="sursa"
              placeholder="— selectează —"
              options={campanii.data ?? []}
              value={form.sursa}
              onChange={(e) => set('sursa', e.target.value)}
            />
          </Field>
          <Field label="Locație preferată" htmlFor="locatia">
            <Select
              id="locatia"
              placeholder="— selectează —"
              options={LOCATII.map((l) => ({ label: l, value: l }))}
              value={form.locatia}
              onChange={(e) => set('locatia', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interes" htmlFor="interes">
            <Select
              id="interes"
              placeholder="— selectează —"
              options={INTERESE.map((i) => ({ label: i, value: i }))}
              value={form.interes}
              onChange={(e) => set('interes', e.target.value)}
            />
          </Field>
          <Field label="Grupă vârstă" htmlFor="grupa_varsta">
            <Select
              id="grupa_varsta"
              placeholder="— selectează —"
              options={GRUPE.map((g) => ({
                label: GRUPA_LABELS[g],
                value: g,
              }))}
              value={form.grupa_varsta}
              onChange={(e) => set('grupa_varsta', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              options={ALL_STATUS_COLUMNS.map((c) => ({
                label: c.label,
                value: c.status,
              }))}
              value={form.status}
              onChange={(e) =>
                set('status', e.target.value as LeadForm['status'])
              }
            />
          </Field>
          <Field label="Data programare" htmlFor="data_programare">
            <DateInput
              id="data_programare"
              value={form.data_programare}
              onChange={(e) => set('data_programare', e.target.value)}
            />
          </Field>
        </div>

        {lead?.status === 'programat' && onReschedule && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <button
              type="button"
              onClick={() => onReschedule(lead)}
              className="font-semibold underline-offset-2 hover:underline"
            >
              📅 Reprogramează
            </button>{' '}
            — schimbarea datei direct în câmpul de mai sus nu actualizează
            programarea din roster. Folosește butonul pentru reprogramare corectă.
          </div>
        )}

        {form.status === 'contactat' && (
          <Field label="Sub-status" htmlFor="sub_status">
            <Select
              id="sub_status"
              placeholder="— niciun sub-status —"
              options={SUB_STATUS_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={form.sub_status}
              onChange={(e) => set('sub_status', e.target.value)}
            />
          </Field>
        )}

        {form.status === 'pierdut' && (
          <Field label="Motiv pierdut" htmlFor="motiv_pierdut">
            <TextInput
              id="motiv_pierdut"
              value={form.motiv_pierdut}
              onChange={(e) => set('motiv_pierdut', e.target.value)}
            />
          </Field>
        )}

        {isEdit && lead && (lead.nr_contactari > 0 || lead.flag_reminder) && (
          <div className="flex items-center gap-4 rounded-md bg-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
            {lead.nr_contactari > 0 && (
              <span>
                Contactări fără răspuns:{' '}
                <span
                  className={
                    lead.nr_contactari >= 3
                      ? 'font-semibold text-amber-600'
                      : 'font-semibold text-quasar-black'
                  }
                >
                  {lead.nr_contactari}
                </span>
              </span>
            )}
            {lead.flag_reminder && (
              <span className="font-medium text-red-600">
                ⚑ Marcat pentru revenire
              </span>
            )}
          </div>
        )}

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            value={form.observatii}
            onChange={(e) => set('observatii', e.target.value)}
          />
        </Field>

        {isEdit && lead && (
          <OptOutSection
            entity="lead"
            id={lead.id}
            optOut={lead.opt_out_marketing ?? false}
            motiv={lead.opt_out_motiv ?? null}
            la={lead.opt_out_la ?? null}
            invalidateKey={['leads']}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
    {isEdit && lead && (
      <LogContactModal
        open={showLogContact}
        lead={lead}
        onClose={() => setShowLogContact(false)}
      />
    )}
    </>
  )
}
