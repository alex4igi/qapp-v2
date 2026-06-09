import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, TextInput, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import {
  logContact,
  type CanalContact,
  type RezultatContact,
} from './api'

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
  const [observatii, setObservatii] = useState('')
  const [dataCallback, setDataCallback] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat('reusit')
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
        dataCallback: rezultat === 'follow_up' ? dataCallback : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la logare.'),
  })

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
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
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
          <Field label="Revenire la (callback)" htmlFor="lc-callback">
            <TextInput
              id="lc-callback"
              type="datetime-local"
              value={dataCallback}
              onChange={(e) => setDataCallback(e.target.value)}
            />
          </Field>
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
