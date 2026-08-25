import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, TextInput, Button } from '@/components/ui'
import { formatRON } from '@/lib/format'
import {
  logRecuperareContact,
  type CanalContact,
  type RezultatContact,
} from './api'

export type RecuperareTarget = {
  clientId: string
  nume: string
  rest?: number | null
  curs?: string | null
}

type Props = {
  open: boolean
  target: RecuperareTarget
  onClose: () => void
}

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'dm', label: 'DM', icon: '📩' },
]

const REZULTATE: { value: RezultatContact; label: string; cls: string }[] = [
  { value: 'reusit', label: 'A plătit / promite', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'follow_up', label: 'Revine cu plata', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'pierdut', label: 'Refuză / nu plătește', cls: 'border-red-300 bg-red-50 text-red-700' },
]

export function LogRecuperareModal({ open, target, onClose }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [rezultat, setRezultat] = useState<RezultatContact>('reusit')
  const [sumaPromisa, setSumaPromisa] = useState('')
  const [promisiuneData, setPromisiuneData] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat('reusit')
    setSumaPromisa('')
    setPromisiuneData('')
    setObservatii('')
    setError(null)
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      logRecuperareContact({
        clientId: target.clientId,
        canal,
        rezultat,
        sumaPromisa: sumaPromisa ? Number(sumaPromisa) : null,
        promisiuneData: promisiuneData || null,
        observatii,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      void queryClient.invalidateQueries({ queryKey: ['restante-worklist'] })
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la logare.')),
  })

  return (
    <Modal
      open={open}
      title={`Loghează apel recuperare — ${target.nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează apelul'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {target.rest != null && (
          <div className="rounded-md bg-quasar-gray-light px-3 py-2 text-sm">
            Rest de recuperat:{' '}
            <span className="font-semibold text-red-600">
              {formatRON(target.rest)}
            </span>
            {target.curs && (
              <span className="text-quasar-gray"> · {target.curs}</span>
            )}
          </div>
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sumă promisă (opțional, RON)" htmlFor="lr-suma">
            <TextInput
              id="lr-suma"
              type="number"
              step="any"
              value={sumaPromisa}
              onChange={(e) => setSumaPromisa(e.target.value)}
              placeholder="ex: 200"
            />
          </Field>
          <Field label="Promite plata până la" htmlFor="lr-promisiune">
            <TextInput
              id="lr-promisiune"
              type="date"
              value={promisiuneData}
              onChange={(e) => setPromisiuneData(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observații" htmlFor="lr-obs">
          <TextArea
            id="lr-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
            placeholder="ex: a promis că achită până vineri"
          />
          <p className="mt-1 text-xs text-quasar-gray">
            Suma „recuperată" din scorecard se ia din plățile reale care urmează
            apelului (în max 7 zile), nu din ce notezi aici.
          </p>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
