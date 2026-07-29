import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, Spinner } from '@/components/ui'
import {
  getSedinteToAbonamentPreview,
  convertSedinteInAbonament,
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

function formatLuna(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  })
}

type Rezultat = { sedinte?: number; pret?: number; de_incasat?: number; credit?: number }

export function ConvertSedinteAbonamentModal({
  enrollmentId,
  open,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Rezultat | null>(null)

  const preview = useQuery({
    queryKey: ['sedinte-to-abonament', enrollmentId],
    queryFn: () => getSedinteToAbonamentPreview({ enrollmentId }),
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setMotiv('')
      setError(null)
      setResult(null)
    }
  }, [open])

  const p = preview.data

  const save = useMutation({
    mutationFn: () =>
      convertSedinteInAbonament({
        clientId: p!.clientId!,
        cursId: p!.cursId!,
        luna: p!.luna!,
        motiv,
      }),
    onSuccess: (res) => {
      setResult(res)
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la conversie.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title="Trece ședințele pe abonament"
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
              form="convert-abonament-form"
              disabled={save.isPending || preview.isLoading || !p?.applicable}
            >
              {save.isPending ? 'Se convertește…' : 'Trece pe abonament'}
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
            ✓ {result.sedinte}{' '}
            {result.sedinte === 1 ? 'ședință convertită' : 'ședințe convertite'} în
            abonament de {result.pret} RON.
          </p>
          {(result.de_incasat ?? 0) > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              Mai are de plătit <strong>{result.de_incasat} RON</strong> pe abonament.
            </p>
          )}
          {(result.credit ?? 0) > 0 && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              Surplusul de <strong>{result.credit} RON</strong> a rămas ca credit în
              favoarea clientului.
            </p>
          )}
          {(result.de_incasat ?? 0) === 0 && (result.credit ?? 0) === 0 && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              Abonamentul e achitat integral din ședințe.
            </p>
          )}
        </div>
      ) : p && !p.applicable ? (
        <p className="text-sm text-amber-700">{p.reason}</p>
      ) : p ? (
        <form id="convert-abonament-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 px-3 py-2 text-sm">
            <p>
              <strong>{p.sedinte?.length}</strong>{' '}
              {p.sedinte?.length === 1 ? 'ședință' : 'ședințe'} în{' '}
              <strong>{formatLuna(p.luna!)}</strong>
              {p.sedinte && p.sedinte.length > 0 && (
                <> ({p.sedinte.map((s) => formatData(s.data)).join(', ')})</>
              )}
              , din care plătit <strong>{p.platit} RON</strong>.
            </p>
            <p className="mt-1">
              <span className="text-quasar-gray">Abonament {formatLuna(p.luna!)}:</span>{' '}
              <strong>{p.pretLunar} RON</strong>
            </p>
            {(p.credit ?? 0) > 0 ? (
              <p className="mt-1 font-medium text-emerald-700">
                → Credit în favoare: {p.credit} RON
              </p>
            ) : (p.deIncasat ?? 0) > 0 ? (
              <p className="mt-1 font-medium text-red-700">
                → De încasat: {p.deIncasat} RON
              </p>
            ) : (
              <p className="mt-1 font-medium text-emerald-700">
                → Achitat integral, fără rest.
              </p>
            )}
          </div>

          <p className="text-xs text-quasar-gray">
            Toate ședințele lunii intră în abonament (banii plătiți pe ele devin avans),
            prezențele se păstrează, iar ședințele din alte luni rămân neatinse.
            {/* Politica family/cross-sell poate scădea prețul cu 10% — se aplică la
                creare, deci suma finală apare în confirmare. */}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Field label="Motiv (opțional)" htmlFor="convert-abonament-motiv">
            <TextArea
              id="convert-abonament-motiv"
              rows={2}
              placeholder="Ex: Clientul trece pe abonament de la jumătatea lunii."
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>
        </form>
      ) : null}
    </Modal>
  )
}
