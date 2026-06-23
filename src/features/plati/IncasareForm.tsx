import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
  Spinner,
} from '@/components/ui'
import { metodaPlataOptions } from '@/lib/enums'
import type { VPlatiInrolari, Incasare } from '@/types/db'
import { createIncasare, getEnrollmentIncasari } from './api'

type Props = {
  open: boolean
  enrollment: VPlatiInrolari
  onClose: () => void
}

export function IncasareForm({ open, enrollment, onClose }: Props) {
  const queryClient = useQueryClient()
  const total = enrollment.total_de_plata ?? 0
  const platit = enrollment.platit ?? 0
  const rest = total - platit

  const [suma, setSuma] = useState(rest > 0 ? String(rest) : '')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [metoda, setMetoda] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  const incasariQuery = useQuery({
    queryKey: ['enrollment', enrollment.id_enrollment, 'incasari'],
    queryFn: () => getEnrollmentIncasari(enrollment.id_enrollment!),
    enabled: Boolean(enrollment.id_enrollment),
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        inregistrare: enrollment.id_enrollment,
        client: enrollment.id_cursant,
        suma: suma.trim() ? Number(suma) : null,
        data: data || null,
        metoda: (metoda || null) as Incasare['metoda'],
        // plată legată de înrolare → mereu Abonament (altfel rămâne NULL)
        categorie: 'Abonament' as Incasare['categorie'],
        observatii: observatii.trim() || null,
      }
      return createIncasare(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({
        queryKey: ['enrollment', enrollment.id_enrollment, 'incasari'],
      })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!suma.trim() || Number(suma) <= 0) {
      setError('Introdu o sumă validă.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title="Adaugă plată"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="incasare-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Înregistrează plata'}
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-quasar-gray-light p-3 text-sm">
        <div className="font-medium text-quasar-black">
          {enrollment.nume_client} {enrollment.prenume_client ?? ''} —{' '}
          {enrollment.nume_curs ?? '—'}
        </div>
        <div className="mt-1 flex gap-4 text-quasar-gray">
          <span>Total: {total} RON</span>
          <span>Plătit: {platit} RON</span>
          <span className={rest > 0 ? 'font-semibold text-red-600' : ''}>
            Rest: {rest} RON
          </span>
        </div>
      </div>

      <form id="incasare-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sumă încasată (RON)" required htmlFor="inc-suma">
            <TextInput
              id="inc-suma"
              type="number"
              min={0}
              value={suma}
              onChange={(e) => setSuma(e.target.value)}
            />
          </Field>
          <Field label="Data" htmlFor="inc-data">
            <TextInput
              id="inc-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Metodă plată" htmlFor="inc-metoda">
          <Select
            id="inc-metoda"
            placeholder="—"
            options={metodaPlataOptions}
            value={metoda}
            onChange={(e) => setMetoda(e.target.value)}
          />
        </Field>

        <Field label="Observații" htmlFor="inc-obs">
          <TextArea
            id="inc-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-bold text-quasar-black">
          Plăți anterioare
        </h3>
        {incasariQuery.isLoading ? (
          <Spinner />
        ) : (incasariQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-quasar-gray">Nicio plată înregistrată.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {incasariQuery.data!.map((inc) => (
              <li
                key={inc.id}
                className="flex justify-between border-b border-quasar-gray-light py-1 last:border-0"
              >
                <span>
                  {inc.data ?? '—'} · {inc.metoda ?? '—'}
                </span>
                <span className="font-medium">{inc.suma ?? 0} RON</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
