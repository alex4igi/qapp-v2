import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, TextInput, Badge, Spinner, type BadgeTone } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { getBileteEveniment, valideazaBilet, type ValidareBilet } from './api'

const REASON_LABEL: Record<string, string> = {
  inexistent: 'Cod inexistent.',
  anulat: 'Bilet anulat.',
  neplatit: 'Bilet neplătit.',
  deja_validat: 'Bilet deja validat (intrare folosită).',
}

// Secțiune „Bilete online" pe pagina evenimentului: lista biletelor vândute online
// + panou de check-in (staff introduce/scanează codul → valideaza_bilet).
export function BileteOnlineSection({ evenimentId }: { evenimentId: string }) {
  const queryClient = useQueryClient()
  const [cod, setCod] = useState('')
  const [result, setResult] = useState<ValidareBilet | null>(null)

  const bileteQ = useQuery({
    queryKey: ['bilete-eveniment', evenimentId],
    queryFn: () => getBileteEveniment(evenimentId),
  })

  const validaMut = useMutation({
    mutationFn: (c: string) => valideazaBilet(c),
    onSuccess: (res) => {
      setResult(res)
      if (res.ok) {
        setCod('')
        void queryClient.invalidateQueries({ queryKey: ['bilete-eveniment', evenimentId] })
      }
    },
    onError: (e) => setResult({ ok: false, reason: humanizeError(e) }),
  })

  const bilete = bileteQ.data ?? []
  const validate = bilete.filter((b) => b.status === 'validat').length

  const onSubmit = () => {
    const c = cod.trim()
    if (c) validaMut.mutate(c)
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-quasar-black">Bilete online</h2>
        {bilete.length > 0 && (
          <span className="text-sm text-quasar-gray">
            {validate} / {bilete.length} validate
          </span>
        )}
      </div>

      {/* Check-in la ușă */}
      <div className="mb-4 rounded-lg border border-quasar-gray-light bg-white p-4">
        <p className="mb-2 text-sm font-medium text-quasar-black">Check-in — validează bilet</p>
        <div className="flex gap-2">
          <TextInput
            placeholder="Scanează sau introdu codul biletului…"
            value={cod}
            onChange={(e) => setCod(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
            }}
            className="max-w-xs"
          />
          <Button onClick={onSubmit} disabled={validaMut.isPending || !cod.trim()}>
            Validează
          </Button>
        </div>
        {result && (
          <div
            className={[
              'mt-3 rounded-md border p-3 text-sm',
              result.ok
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700',
            ].join(' ')}
          >
            {result.ok ? (
              <>
                ✓ <strong>Intrare validă</strong>
                {result.client ? ` — ${result.client}` : ''}
                {result.pret != null ? ` · ${formatRON(result.pret)}` : ''}
              </>
            ) : (
              <>✗ {REASON_LABEL[result.reason ?? ''] ?? result.reason ?? 'Bilet invalid.'}</>
            )}
          </div>
        )}
      </div>

      {/* Lista biletelor vândute online */}
      {bileteQ.isLoading ? (
        <Spinner />
      ) : bilete.length === 0 ? (
        <p className="rounded-lg border border-dashed border-quasar-gray-light p-6 text-center text-sm text-quasar-gray">
          Niciun bilet vândut online încă.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-quasar-gray-light bg-white">
          <table className="w-full text-sm">
            <thead className="bg-quasar-gray-light/40 text-left text-xs uppercase tracking-wide text-quasar-gray">
              <tr>
                <th className="px-3 py-2">Cod</th>
                <th className="px-3 py-2">Cumpărător</th>
                <th className="px-3 py-2">Preț</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {bilete.map((b) => {
                const tone: BadgeTone = b.status === 'validat' ? 'success' : 'brand'
                return (
                  <tr key={b.id} className="border-t border-quasar-gray-light">
                    <td className="px-3 py-2 font-mono text-xs">{b.cod ?? '—'}</td>
                    <td className="px-3 py-2">{b.clientNume ?? '—'}</td>
                    <td className="px-3 py-2">{formatRON(b.pret)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={tone}>{b.status === 'validat' ? 'Validat' : 'Plătit'}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
