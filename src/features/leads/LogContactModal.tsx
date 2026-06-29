import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, DateInput, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { SUB_STATUS_OPTIONS, dataPesteZile } from './constants'
import {
  logContact,
  type CanalContact,
  type RezultatContact,
} from './api'

type SubStatus = 'de_revenit' | 'nu_raspunde'

type Props = {
  open: boolean
  lead: Lead
  onClose: () => void
}

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'dm', label: 'DM', icon: '📩' },
]

const REZULTATE: { value: RezultatContact; label: string; cls: string }[] = [
  { value: 'reusit', label: 'Reușit', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'follow_up', label: 'Follow-up', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'pierdut', label: 'Pierdut', cls: 'border-red-300 bg-red-50 text-red-700' },
]

export function LogContactModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [rezultat, setRezultat] = useState<RezultatContact>('reusit')
  const [subStatus, setSubStatus] = useState<SubStatus>('de_revenit')
  const [observatii, setObservatii] = useState('')
  const [dataCallback, setDataCallback] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat('reusit')
    setSubStatus('de_revenit')
    setObservatii('')
    setDataCallback('')
    setError(null)
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      logContact({
        leadId: lead.id,
        canal,
        rezultat,
        observatii,
        subStatus: rezultat === 'follow_up' ? subStatus : undefined,
        dataCallback: rezultat === 'follow_up' ? dataCallback : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la logare.')),
  })

  const handleSave = () => {
    // Follow-up cere o dată (paritate cu „Marchează contactarea").
    if (rezultat === 'follow_up' && !dataCallback) {
      setError('Setează data de follow-up.')
      return
    }
    setError(null)
    save.mutate()
  }

  const fullName =
    [lead.prenume, lead.nume].filter(Boolean).join(' ') || lead.nume

  return (
    <Modal
      open={open}
      title={`Loghează contact — ${fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează contactul'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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

        <Field label="Rezultat">
          <div className="flex flex-wrap gap-2">
            {REZULTATE.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRezultat(r.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  rezultat === r.value
                    ? `${r.cls} font-medium`
                    : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Field>

        {rezultat === 'follow_up' && (
          <>
            <Field label="Sub-status">
              <div className="flex flex-wrap gap-1.5">
                {SUB_STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setSubStatus(o.value)
                      // „Nu răspunde" → follow-up implicit peste o săptămână
                      // (editabil), ca în „Marchează contactarea".
                      if (o.value === 'nu_raspunde' && !dataCallback)
                        setDataCallback(dataPesteZile(7))
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

            <Field
              label={
                subStatus === 'nu_raspunde'
                  ? 'Când re-încercăm?'
                  : 'Revenire la (callback)'
              }
              required
              htmlFor="lc-callback"
            >
              <DateInput
                id="lc-callback"
                value={dataCallback}
                onChange={(e) => setDataCallback(e.target.value)}
              />
            </Field>
          </>
        )}

        <Field label="Observații" htmlFor="lc-obs">
          <TextArea
            id="lc-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
            placeholder="ex: interesat, revine după ce vorbește cu părintele"
          />
          <p className="mt-1 text-xs text-quasar-gray">
            Notează ce ați discutat — un contact „Reușit" fără notă scade scorul
            de igienă CRM.
          </p>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
