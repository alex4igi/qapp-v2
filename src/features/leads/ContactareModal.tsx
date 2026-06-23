import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, DateTimeInput, TextArea, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { SUB_STATUS_OPTIONS, prependObservatie } from './constants'
import { updateLead, type LeadForm } from './api'

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
}

type SubStatus = 'de_revenit' | 'nu_raspunde'

export function ContactareModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [subStatus, setSubStatus] = useState<SubStatus | ''>('')
  const [dataCallback, setDataCallback] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSubStatus((lead?.sub_status as SubStatus | null) ?? '')
    setDataCallback(
      lead?.data_callback_dorit ? lead.data_callback_dorit.slice(0, 16) : '',
    )
    setNota('')
    setError(null)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: () => {
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
      return updateLead(lead!.id, form)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!subStatus) {
      setError('Alege un sub-status.')
      return
    }
    if (!dataCallback) {
      setError('Data și ora sunt obligatorii.')
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
        : 'Data și ora următoarei contactări'

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

        <Field label="Sub-status" required htmlFor="contactare-substatus">
          <div className="flex flex-wrap gap-1.5">
            {SUB_STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setSubStatus(o.value)
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
          <DateTimeInput
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
