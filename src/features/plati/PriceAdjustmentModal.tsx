import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, TextInput, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { adjustEnrollmentPrice } from './api'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

type EnrollmentInfo = {
  id: string
  suma: number | null
  data_incepere: string | null
  tip_plata: string | null
  nume_curs: string | null
  nume_client: string | null
}

async function fetchEnrollmentInfo(id: string): Promise<EnrollmentInfo> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      'id, suma, data_incepere, tip_plata, cursul(numele), client(nume, prenume)',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  const row = data as unknown as {
    id: string
    suma: number | null
    data_incepere: string | null
    tip_plata: string | null
    cursul: { numele: string | null } | null
    client: { nume: string | null; prenume: string | null } | null
  }
  return {
    id: row.id,
    suma: row.suma,
    data_incepere: row.data_incepere,
    tip_plata: row.tip_plata,
    nume_curs: row.cursul?.numele ?? null,
    nume_client: row.client
      ? `${row.client.nume ?? ''} ${row.client.prenume ?? ''}`.trim()
      : null,
  }
}

export function PriceAdjustmentModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [newSuma, setNewSuma] = useState('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const infoQ = useQuery({
    queryKey: ['enrollment-info', enrollmentId],
    queryFn: () => fetchEnrollmentInfo(enrollmentId),
    enabled: open,
  })

  useEffect(() => {
    if (open && infoQ.data) {
      setNewSuma(String(infoQ.data.suma ?? ''))
    }
    if (!open) {
      setNewSuma('')
      setMotiv('')
      setError(null)
    }
  }, [open, infoQ.data])

  const save = useMutation({
    mutationFn: () =>
      adjustEnrollmentPrice({
        enrollmentId,
        newSuma: Number(newSuma),
        motiv,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['enrollment-info', enrollmentId] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = Number(newSuma)
    if (!Number.isFinite(n) || n < 0) {
      setError('Sumă invalidă.')
      return
    }
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title="Ajustează preț înrolare"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="price-adjust-form"
            disabled={save.isPending || infoQ.isLoading}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      {infoQ.isLoading ? (
        <Spinner />
      ) : infoQ.isError ? (
        <p className="text-sm text-red-600">
          {infoQ.error instanceof Error ? infoQ.error.message : 'Eroare la încărcare.'}
        </p>
      ) : (
        <form id="price-adjust-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Cursant:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_client ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Curs:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_curs ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Tip plată:</span>{' '}
              {infoQ.data?.tip_plata ?? '—'}
            </p>
            <p>
              <span className="text-quasar-gray">Sumă actuală:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.suma ?? 0} RON
              </strong>
            </p>
          </div>

          <Field label="Sumă nouă (RON)" required htmlFor="adj-suma">
            <TextInput
              id="adj-suma"
              type="number"
              min={0}
              step="1"
              value={newSuma}
              onChange={(e) => setNewSuma(e.target.value)}
            />
          </Field>

          <Field label="Motiv ajustare" required htmlFor="adj-motiv">
            <TextArea
              id="adj-motiv"
              rows={3}
              placeholder="Ex: Reducere pentru circumstanțe speciale convenite cu părintele…"
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            Modificarea se înregistrează în jurnalul de audit (cine, când, de ce).
            Suma se aplică pe înrolare; plățile deja înregistrate rămân neschimbate.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
