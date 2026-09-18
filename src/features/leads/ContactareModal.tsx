import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, DateInput, TextArea, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { SUB_STATUS_OPTIONS, prependObservatie, dataUrmatoareiIncercari } from './constants'
import {
  insertLeadContact,
  updateLead,
  type CanalContact,
  type LeadForm,
} from './api'

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
}

type SubStatus = 'de_revenit' | 'nu_raspunde'

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'dm', label: 'DM', icon: '📩' },
]

export function ContactareModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [subStatus, setSubStatus] = useState<SubStatus | ''>('')
  const [dataCallback, setDataCallback] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setSubStatus((lead?.sub_status as SubStatus | null) ?? '')
    setDataCallback(
      lead?.data_callback_dorit ? lead.data_callback_dorit.slice(0, 10) : '',
    )
    setNota('')
    setError(null)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: async () => {
      const form: Partial<LeadForm> = {
        status: 'contactat',
        sub_status: subStatus,
        data_callback_dorit: dataCallback,
      }
      if (nota.trim())
        form.observatii = prependObservatie(
          'Contactat',
          nota,
          lead!.observatii,
        )

      // Acest modal E acțiunea „am contactat", deci lasă urmă în lead_contacte ca
      // orice alt contact. Altfel fluxul cel mai folosit (drag → Contactat) rămânea
      // invizibil pentru scorecard și pentru coloana „Ultim contact".
      // `rezultat: follow_up` pentru ambele sub-statusuri — o dată de revenire e
      // mereu setată aici; păstrează paritatea cu LogContactModal, care înregistrează
      // tot `follow_up` în aceeași situație.
      await insertLeadContact({
        leadId: lead!.id,
        canal,
        rezultat: 'follow_up',
        observatii: nota,
      })

      // `de_revenit` = a răspuns (revine el sau îl sunăm noi) → seria de încercări
      // fără răspuns se rupe. `nu_raspunde` = n-am dat de el → o încercare în plus.
      return updateLead(lead!.id, form, {
        contact: subStatus === 'de_revenit' ? 'reusit' : 'incercare',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!subStatus) {
      setError('Alege un sub-status.')
      return
    }
    if (!dataCallback) {
      setError('Data este obligatorie.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  const dateLabel =
    subStatus === 'de_revenit'
      ? 'Când îl sunăm înapoi (sau când ne contactează el)?'
      : subStatus === 'nu_raspunde'
        ? 'Când re-încercăm?'
        : 'Data următoarei contactări'

  return (
    <Modal
      open={open}
      title="Marchează contactarea"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="contactare-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Confirmă'}
          </Button>
        </>
      }
    >
      <form id="contactare-form" onSubmit={handleSubmit} className="space-y-3">
        {lead && (
          <p className="text-sm text-quasar-gray">
            Contactare pentru{' '}
            <span className="font-medium text-quasar-black">
              {[lead.prenume, lead.nume].filter(Boolean).join(' ')}
            </span>
          </p>
        )}

        <Field label="Canal">
          <div className="flex flex-wrap gap-2">
            {CANALE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCanal(c.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  canal === c.value
                    ? 'border-quasar-yellow bg-quasar-yellow/10 font-medium text-quasar-black'
                    : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Sub-status" required htmlFor="contactare-substatus">
          <div className="flex flex-wrap gap-1.5">
            {SUB_STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setSubStatus(o.value)
                  // „Nu răspunde" → follow-up implicit peste o săptămână
                  // (editabil). Operatorul nu trebuie să aleagă manual o dată.
                  if (o.value === 'nu_raspunde' && !dataCallback)
                    setDataCallback(dataUrmatoareiIncercari(lead?.nr_contactari ?? 0))
                  setError(null)
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  subStatus === o.value
                    ? o.cls
                    : 'border-quasar-gray-light bg-white text-quasar-gray hover:border-quasar-gray'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={dateLabel} required htmlFor="contactare-data">
          <DateInput
            id="contactare-data"
            value={dataCallback}
            onChange={(e) => setDataCallback(e.target.value)}
          />
        </Field>

        <Field label="Notă (opțional)" htmlFor="contactare-nota">
          <TextArea
            id="contactare-nota"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex: a cerut detalii despre grupa de Teens…"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
