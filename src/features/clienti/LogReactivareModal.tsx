import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, Button } from '@/components/ui'
import type { Client } from '@/types/db'
import {
  logReactivareContact,
  type CanalContact,
  type RezultatContact,
} from './api'

type Props = {
  open: boolean
  client: Pick<Client, 'id' | 'nume' | 'prenume' | 'status'>
  onClose: () => void
}

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'dm', label: 'DM', icon: '📩' },
]

const REZULTATE: { value: RezultatContact; label: string; cls: string }[] = [
  { value: 'reusit', label: 'Revine la cursuri', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'follow_up', label: 'Se mai gândește', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'pierdut', label: 'Renunță definitiv', cls: 'border-red-300 bg-red-50 text-red-700' },
]

export function LogReactivareModal({ open, client, onClose }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [rezultat, setRezultat] = useState<RezultatContact>('reusit')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat('reusit')
    setObservatii('')
    setError(null)
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      logReactivareContact({ clientId: client.id, canal, rezultat, observatii }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la logare.'),
  })

  const fullName = `${client.nume} ${client.prenume ?? ''}`.trim()

  return (
    <Modal
      open={open}
      title={`Loghează reactivare — ${fullName}`}
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
        <div className="rounded-md bg-quasar-gray-light px-3 py-2 text-sm text-quasar-gray">
          Status curent:{' '}
          <span className="font-semibold text-quasar-black">
            {client.status ?? '—'}
          </span>
        </div>

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

        <Field label="Observații" htmlFor="lreact-obs">
          <TextArea
            id="lreact-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
            placeholder="ex: revine săptămâna viitoare la grupa de Tiny"
          />
          <p className="mt-1 text-xs text-quasar-gray">
            „Reactivat" în scorecard înseamnă o prezență reală după acest contact,
            nu ce notezi aici.
          </p>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
