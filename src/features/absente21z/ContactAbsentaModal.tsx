import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, TextInput, Select, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getMotiveAbandon, marcheazaContact } from './api'
import type { CanalContact, CazAbsenta, RezultatContact } from './types'

type Props = { open: boolean; caz: CazAbsenta | null; onClose: () => void }

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'dm', label: 'WhatsApp / DM', icon: '📩' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
]

const REZULTATE: { value: RezultatContact; label: string; cls: string }[] = [
  { value: 'reusit', label: 'Revine la curs', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'follow_up', label: 'Amână / de revenit', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'pierdut', label: 'Renunță', cls: 'border-red-300 bg-red-50 text-red-700' },
]

export function ContactAbsentaModal({ open, caz, onClose }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [rezultat, setRezultat] = useState<RezultatContact>('reusit')
  const [motivId, setMotivId] = useState('')
  const [motivLiber, setMotivLiber] = useState('')
  const [pasUrmator, setPasUrmator] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  const motive = useQuery({
    queryKey: ['motive-abandon'],
    queryFn: getMotiveAbandon,
    staleTime: 30 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat('reusit')
    setMotivId('')
    setMotivLiber('')
    setPasUrmator('')
    setObservatii('')
    setError(null)
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      marcheazaContact({
        absentaId: caz!.id,
        canal,
        rezultat,
        motivId: motivId || null,
        motivLiber: motivLiber || null,
        pasUrmator: pasUrmator || null,
        observatii: observatii || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absente-21z'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvarea contactului.')),
  })

  if (!caz) return null

  return (
    <Modal
      open={open}
      title={`Contact recuperare — ${caz.client_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !motivId}>
            {save.isPending ? 'Se salvează…' : 'Marchează contactat'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md bg-quasar-gray-light px-3 py-2 text-sm">
          {caz.curs_nume}
          {caz.locatie_nume && <span className="text-quasar-gray"> · {caz.locatie_nume}</span>}
          <div className="mt-0.5 text-quasar-gray">
            {caz.zile_tacere} zile fără prezență
            {caz.ultima_prezenta
              ? ` · ultima dată pe ${caz.ultima_prezenta}`
              : ' · nu a venit niciodată'}
            {caz.telefon && ` · ${caz.telefon}`}
          </div>
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

        <Field label="Motivul declarat de client" htmlFor="ca-motiv">
          <Select
            id="ca-motiv"
            value={motivId}
            onChange={(e) => setMotivId(e.target.value)}
            options={[
              { value: '', label: motive.isLoading ? 'Se încarcă…' : '— alege motivul —' },
              ...(motive.data ?? []).map((m) => ({ value: m.id, label: m.eticheta })),
            ]}
          />
          <p className="mt-1 text-xs text-quasar-gray">
            Obligatoriu. După un sezon, lista asta arată de ce pleacă oamenii de la Quasar —
            e singurul loc unde se adună informația.
          </p>
        </Field>

        <Field label="Detalii despre motiv (opțional)" htmlFor="ca-motiv-liber">
          <TextInput
            id="ca-motiv-liber"
            value={motivLiber}
            onChange={(e) => setMotivLiber(e.target.value)}
            placeholder="ex: s-a suprapus cu meditațiile la mate"
          />
        </Field>

        <Field label="Pas următor" htmlFor="ca-pas">
          <TextInput
            id="ca-pas"
            value={pasUrmator}
            onChange={(e) => setPasUrmator(e.target.value)}
            placeholder="ex: revine luni la 17:30 / resun peste 2 săptămâni"
          />
        </Field>

        <Field label="Observații" htmlFor="ca-obs">
          <TextArea
            id="ca-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
            placeholder="ce ai discutat"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
