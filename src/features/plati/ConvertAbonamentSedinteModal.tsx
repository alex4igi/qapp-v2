import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, Spinner } from '@/components/ui'
import {
  getAbonamentToSedintePreview,
  convertAbonamentInSedinte,
} from './api'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
  })
}

type Rezultat = { sedinte?: number; credit?: number; datorie?: number }

export function ConvertAbonamentSedinteModal({
  enrollmentId,
  open,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Rezultat | null>(null)

  const preview = useQuery({
    queryKey: ['abonament-to-sedinte', enrollmentId],
    queryFn: () => getAbonamentToSedintePreview({ enrollmentId }),
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setMotiv('')
      setError(null)
      setResult(null)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () => convertAbonamentInSedinte({ enrollmentId, motiv }),
    onSuccess: (res) => {
      setResult(res)
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la conversie.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  const p = preview.data

  return (
    <Modal
      open={open}
      title="Trece abonamentul pe ședințe"
      onClose={onClose}
      footer={
        result ? (
          <Button onClick={onClose}>Închide</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Anulează
            </Button>
            <Button
              type="submit"
              form="convert-sedinte-form"
              disabled={save.isPending || preview.isLoading || !p?.applicable}
            >
              {save.isPending ? 'Se convertește…' : 'Trece pe ședințe'}
            </Button>
          </>
        )
      }
    >
      {preview.isLoading ? (
        <Spinner />
      ) : preview.isError ? (
        <p className="text-sm text-red-600">
          {humanizeError(preview.error, 'Eroare la încărcare.')}
        </p>
      ) : result ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-emerald-700">
            ✓ Abonament convertit în {result.sedinte}{' '}
            {result.sedinte === 1 ? 'ședință' : 'ședințe'}.
          </p>
          {(result.credit ?? 0) > 0 && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              Surplusul de <strong>{result.credit} RON</strong> a rămas ca credit în
              favoarea clientului (se scade automat la următoarea plată).
            </p>
          )}
          {(result.datorie ?? 0) > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              Ședințele prezente însumează o datorie de{' '}
              <strong>{result.datorie} RON</strong> de încasat.
            </p>
          )}
        </div>
      ) : p && !p.applicable ? (
        <p className="text-sm text-amber-700">{p.reason}</p>
      ) : p ? (
        <form id="convert-sedinte-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 px-3 py-2 text-sm">
            {p.sedinte === 0 ? (
              <p>
                Nicio ședință marcată <strong>Prezent</strong> în luna curentă.
                Abonamentul se va închide{' '}
                {(p.platit ?? 0) > 0
                  ? `iar cei ${p.platit} RON plătiți rămân credit în favoare.`
                  : '(neachitat, fără datorie).'}
              </p>
            ) : (
              <>
                <p>
                  <strong>{p.sedinte}</strong>{' '}
                  {p.sedinte === 1 ? 'ședință prezentă' : 'ședințe prezente'} în lună
                  {p.dates && p.dates.length > 0 && (
                    <> ({p.dates.map(formatData).join(', ')})</>
                  )}{' '}
                  × {p.pretSedinta} RON = <strong>{p.total} RON</strong>
                </p>
                <p className="mt-1">
                  <span className="text-quasar-gray">Plătit pe abonament:</span>{' '}
                  <strong>{p.platit} RON</strong>
                </p>
                {(p.credit ?? 0) > 0 ? (
                  <p className="mt-1 font-medium text-emerald-700">
                    → Credit în favoare: {p.credit} RON
                  </p>
                ) : (p.datorie ?? 0) > 0 ? (
                  <p className="mt-1 font-medium text-red-700">
                    → Datorie de încasat: {p.datorie} RON
                  </p>
                ) : (
                  <p className="mt-1 font-medium text-emerald-700">
                    → Achitat integral, fără rest.
                  </p>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-quasar-gray">
            Ședințele viitoare NU se încasează acum — clientul le plătește per-ședință
            când vine. Abonamentul se închide curat (fără restanță fantomă).
          </p>

          <Field label="Motiv (opțional)" htmlFor="convert-motiv">
            <TextArea
              id="convert-motiv"
              rows={2}
              placeholder="Ex: Clientul s-a răzgândit, preferă plata per ședință."
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      ) : null}
    </Modal>
  )
}
