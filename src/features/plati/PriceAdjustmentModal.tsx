import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, TextInput, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { adjustEnrollmentPrice, getEnrollmentPaid, type SurplusAction } from './api'

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
  paid: number
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
  const paid = await getEnrollmentPaid(id)
  return {
    id: row.id,
    suma: row.suma,
    data_incepere: row.data_incepere,
    tip_plata: row.tip_plata,
    nume_curs: row.cursul?.numele ?? null,
    nume_client: row.client
      ? `${row.client.nume ?? ''} ${row.client.prenume ?? ''}`.trim()
      : null,
    paid,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function PriceAdjustmentModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [newSuma, setNewSuma] = useState('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)
  // La surplus, implicit lăsăm creditul în cont; alocarea la altă datorie se face
  // ulterior din profil („Folosește credit"). Aici doar credit vs restituire.
  const [surplusAction, setSurplusAction] = useState<SurplusAction>('credit')

  const infoQ = useQuery({
    queryKey: ['enrollment-info', enrollmentId],
    queryFn: () => fetchEnrollmentInfo(enrollmentId),
    enabled: open,
  })

  const paid = infoQ.data?.paid ?? 0
  const n = Number(newSuma)
  const surplus = Number.isFinite(n) && n >= 0 ? round2(paid - n) : 0
  const hasSurplus = surplus > 0.004

  useEffect(() => {
    if (open && infoQ.data) setNewSuma(String(infoQ.data.suma ?? ''))
    if (!open) {
      setNewSuma('')
      setMotiv('')
      setError(null)
      setSurplusAction('credit')
    }
  }, [open, infoQ.data])

  const save = useMutation({
    mutationFn: () =>
      adjustEnrollmentPrice({
        enrollmentId,
        newSuma: n,
        motiv,
        surplusAction: hasSurplus ? surplusAction : 'none',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['client-credit'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({
        queryKey: ['enrollment-info', enrollmentId],
      })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
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

  const radio = (value: SurplusAction) => ({
    type: 'radio' as const,
    name: 'surplus-action',
    checked: surplusAction === value,
    onChange: () => setSurplusAction(value),
    className: 'mt-0.5',
  })

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
          {humanizeError(infoQ.error, 'Eroare la încărcare.')}
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
              </strong>{' '}
              <span className="text-quasar-gray">· încasat:</span>{' '}
              <strong className="text-quasar-black">{paid} RON</strong>
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

          {hasSurplus && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">
                Rezultă un surplus de {surplus} RON
              </p>
              <p className="text-xs text-quasar-gray">
                S-au încasat {paid} RON, iar suma nouă e {n} RON. Ce faci cu
                surplusul?
              </p>

              <label className="flex items-start gap-2 text-sm">
                <input {...radio('credit')} />
                <span className="flex-1 font-medium text-quasar-black">
                  Lasă drept credit în cont ({surplus} RON)
                  <span className="block text-xs font-normal text-quasar-gray">
                    Rămâne credit în favoarea clientului, vizibil pe profil. Îl
                    poți aloca ulterior la o plată/datorie („Folosește credit").
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input {...radio('refund')} />
                <span className="flex-1 font-medium text-quasar-black">
                  Restituie banii ({surplus} RON)
                  <span className="block text-xs font-normal text-quasar-gray">
                    Se înregistrează o restituire; restul devine 0.
                  </span>
                </span>
              </label>
            </div>
          )}

          <p className="text-xs text-quasar-gray">
            Modificarea se înregistrează în jurnalul de audit (cine, când, de ce).
            {!hasSurplus &&
              ' Suma se aplică pe înrolare; plățile deja înregistrate rămân neschimbate.'}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
