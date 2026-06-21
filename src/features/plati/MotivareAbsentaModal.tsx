import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, TextArea, Spinner } from '@/components/ui'
import {
  getMotivareAbsentaContext,
  aprobaMotivareAbsenta,
  type MotivareAbsentaResult,
} from './api'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

function formatLuna(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })
}

export function MotivareAbsentaModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [documentId, setDocumentId] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MotivareAbsentaResult | null>(null)

  const ctxQ = useQuery({
    queryKey: ['motivare-context', enrollmentId],
    queryFn: () => getMotivareAbsentaContext(enrollmentId),
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setDocumentId('')
      setObservatii('')
      setError(null)
      setResult(null)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      aprobaMotivareAbsenta({
        enrollmentId,
        document: documentId || null,
        observatii,
      }),
    onSuccess: (res) => {
      setResult(res)
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['client-prezente-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la aprobare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  const ctx = ctxQ.data
  const creditText: Record<MotivareAbsentaResult['credit'], string> = {
    niciun: '',
    luna_urmatoare: ' Plata existentă a fost mutată ca credit pe luna următoare.',
    sold_favoare: ' Plata existentă rămâne ca sold în favoare pe această lună.',
  }

  return (
    <Modal
      open={open}
      title="Motivează absențele lunii"
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
              form="motivare-form"
              disabled={save.isPending || ctxQ.isLoading}
            >
              {save.isPending ? 'Se aprobă…' : 'Aprobă motivarea'}
            </Button>
          </>
        )
      }
    >
      {ctxQ.isLoading ? (
        <Spinner />
      ) : ctxQ.isError ? (
        <p className="text-sm text-red-600">
          {ctxQ.error instanceof Error ? ctxQ.error.message : 'Eroare la încărcare.'}
        </p>
      ) : result ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-emerald-700">
            ✓ {result.motivate} {result.motivate === 1 ? 'absență marcată' : 'absențe marcate'} ca Motivat.
          </p>
          {result.scutit ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              Luna {formatLuna(result.luna)} a fost <strong>dedusă de plată (0 lei)</strong> —
              {' '}{result.absente} absențe peste pragul de {result.prag}.
              {creditText[result.credit]}
            </p>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              Absențele au fost motivate, dar <strong>fără scutire</strong> de plată
              ({result.absente} absențe, sub pragul de {result.prag} sau înrolare nelunară).
            </p>
          )}
        </div>
      ) : ctx ? (
        <form id="motivare-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Cursant:</span>{' '}
              <strong className="text-quasar-black">{ctx.clientNume ?? '—'}</strong>
            </p>
            <p>
              <span className="text-quasar-gray">Curs:</span>{' '}
              <strong className="text-quasar-black">{ctx.cursNume ?? '—'}</strong>
            </p>
            <p>
              <span className="text-quasar-gray">Luna:</span>{' '}
              <strong className="text-quasar-black">{formatLuna(ctx.luna)}</strong>
            </p>
          </div>

          <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 px-3 py-2 text-sm">
            <p>
              <span className="text-quasar-gray">Absențe în lună:</span>{' '}
              <strong>{ctx.absente}</strong> · prag scutire (2 × {ctx.sedintePerSapt} ședințe/săpt):{' '}
              <strong>{ctx.prag}</strong>
            </p>
            {ctx.tipPlata !== 'Per luna' ? (
              <p className="mt-1 text-amber-700">
                Înrolare „{ctx.tipPlata ?? '—'}" — se vor motiva absențele, dar fără scutire (scutirea e doar pe înrolări lunare).
              </p>
            ) : ctx.eligibilScutire ? (
              <p className="mt-1 font-medium text-emerald-700">
                ✓ Eligibil pentru scutire — luna va deveni 0 lei.
              </p>
            ) : (
              <p className="mt-1 text-quasar-gray">
                Sub prag — absențele se motivează, fără scutire.
              </p>
            )}
          </div>

          <Field label="Adeverință medicală (din Documente)" htmlFor="mot-doc">
            {ctx.documenteMedicale.length > 0 ? (
              <Select
                id="mot-doc"
                placeholder="— alege documentul Medical —"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                options={ctx.documenteMedicale.map((d) => ({
                  value: d.id,
                  label: d.titlu || `Document medical (${new Date(d.created).toLocaleDateString('ro-RO')})`,
                }))}
              />
            ) : (
              <p className="text-xs text-quasar-gray">
                Niciun document „Medical" încărcat pentru acest cursant. Îl poți adăuga din tab-ul Documente
                (recepția urcă adeverința pe Drive). Poți aproba și fără document atașat.
              </p>
            )}
          </Field>

          <Field label="Observații" htmlFor="mot-obs">
            <TextArea
              id="mot-obs"
              rows={3}
              placeholder="Ex: Adeverință medicală 03–17 iun, aprobat în baza documentului din Drive."
              value={observatii}
              onChange={(e) => setObservatii(e.target.value)}
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            Aprobarea marchează absențele lunii ca „Motivat" și se înregistrează în audit. Dacă numărul
            de absențe depășește pragul, luna devine 0 lei (prezențele rămân înregistrate).
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      ) : null}
    </Modal>
  )
}
