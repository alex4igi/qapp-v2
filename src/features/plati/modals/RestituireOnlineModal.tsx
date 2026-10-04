import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Spinner, TextArea, TextInput } from '@/components/ui'
import { formatDate, formatRON } from '@/lib/format'
import {
  getComandaOnline,
  inchideRestituire,
  restituieOnline,
  type RestituireRow,
  type RezultatRestituire,
} from '../api/restituire-online'

type Props = {
  orderRef: string
  clientNume: string
  open: boolean
  onClose: () => void
}

const TIP_COMANDA: Record<string, string> = {
  abonament: 'Plată abonament',
  rezervare: 'Rezervare Open class',
  bilet: 'Bilete',
}

const FGO_TEXT: Record<NonNullable<RestituireRow['fgo_status']>, string> = {
  stornata: 'factura stornată în FGO',
  de_stornat_manual: 'factura trebuie stornată manual în FGO',
  eroare: 'stornarea FGO a dat eroare — storneaz-o manual',
  fara_factura: 'comanda n-avea factură FGO',
}

export function RestituireOnlineModal({ orderRef, clientNume, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [suma, setSuma] = useState('')
  const [motiv, setMotiv] = useState('')
  const [mod, setMod] = useState<'netopia' | 'manual'>('netopia')
  const [error, setError] = useState<string | null>(null)
  const [rezultat, setRezultat] = useState<RezultatRestituire | null>(null)

  const comandaQ = useQuery({
    queryKey: ['restituire-online', orderRef],
    queryFn: () => getComandaOnline(orderRef),
    enabled: open,
  })
  const c = comandaQ.data
  const ramas = c ? Math.round((c.amount - c.restituit) * 100) / 100 : 0
  const inCurs = c?.restituiri.find((r) => r.status === 'in_curs') ?? null

  useEffect(() => {
    if (c) {
      setSuma(String(ramas))
      if (!c.areNtpId) setMod('manual')
    }
  }, [c, ramas])

  const dupa = (r: RezultatRestituire) => {
    void queryClient.invalidateQueries({ queryKey: ['plati'] })
    void queryClient.invalidateQueries({ queryKey: ['plati-sumar'] })
    void queryClient.invalidateQueries({ queryKey: ['incasari'] })
    void queryClient.invalidateQueries({ queryKey: ['restituire-online', orderRef] })
    setRezultat(r)
  }

  const restituie = useMutation({
    mutationFn: () => restituieOnline({ orderRef, suma: Number(suma), motiv, mod }),
    onSuccess: dupa,
    onError: (e: unknown) => {
      setError(humanizeError(e, 'Restituirea n-a reușit.'))
      void queryClient.invalidateQueries({ queryKey: ['restituire-online', orderRef] })
    },
  })

  const inchide = useMutation({
    mutationFn: (baniiAuPlecat: boolean) => inchideRestituire(inCurs!.id, baniiAuPlecat),
    onSuccess: dupa,
    onError: (e: unknown) => setError(humanizeError(e, 'N-am putut închide restituirea.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const s = Number(suma)
    if (!(s > 0)) return setError('Suma trebuie să fie mai mare ca zero.')
    if (s > ramas + 0.004) return setError(`Se pot restitui cel mult ${formatRON(ramas)}.`)
    if (!motiv.trim()) return setError('Motivul e obligatoriu.')
    restituie.mutate()
  }

  const integral = c ? Number(suma) >= ramas - 0.004 && c.restituit === 0 : false
  const busy = restituie.isPending || inchide.isPending

  const footer = rezultat ? (
    <Button onClick={onClose}>Închide</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        Anulează
      </Button>
      {!inCurs && ramas > 0 && (
        <Button type="submit" form="restituire-online-form" disabled={busy || comandaQ.isLoading}>
          {restituie.isPending
            ? 'Se restituie…'
            : mod === 'netopia'
              ? 'Restituie pe card'
              : 'Înregistrează restituirea'}
        </Button>
      )}
    </>
  )

  return (
    <Modal open={open} title="Restituie plata online" onClose={onClose} footer={footer}>
      {comandaQ.isLoading ? (
        <Spinner />
      ) : comandaQ.isError || !c ? (
        <p className="text-sm text-red-600">{humanizeError(comandaQ.error, 'Eroare la încărcare.')}</p>
      ) : rezultat ? (
        <div className="space-y-2 text-sm">
          {rezultat.status === 'efectuata' ? (
            <>
              <p className="font-medium text-emerald-700">Restituirea e înregistrată.</p>
              <p className="text-quasar-gray">
                Încasarea negativă e în registru, cu urmă în jurnalul de audit.
                {c.order_type === 'rezervare' && c.restituit >= c.amount - 0.004 &&
                  ' Rezervarea Open class a fost anulată și locul eliberat.'}
              </p>
              {rezultat.fgo_status && (
                <p className={rezultat.fgo_status === 'stornata' ? 'text-quasar-gray' : 'text-amber-700'}>
                  FGO: {FGO_TEXT[rezultat.fgo_status]}
                  {rezultat.fgo_storno ? ` (${rezultat.fgo_storno})` : ''}
                  {rezultat.fgo_eroare ? `: ${rezultat.fgo_eroare}` : ''}.
                </p>
              )}
            </>
          ) : (
            <p className="text-quasar-gray">Încercarea a fost închisă fără bani restituiți.</p>
          )}
        </div>
      ) : (
        <form id="restituire-online-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Client:</span>{' '}
              <strong className="text-quasar-black">{clientNume || '—'}</strong>
            </p>
            <p>
              <span className="text-quasar-gray">Comanda:</span> {TIP_COMANDA[c.order_type] ?? c.order_type} ·{' '}
              {formatRON(c.amount)} · {formatDate(c.created)}
            </p>
            <p className="text-xs text-quasar-gray">
              {c.order_ref}
              {c.factura ? ` · factura ${c.factura}` : ''}
            </p>
          </div>

          {c.restituiri.length > 0 && (
            <ul className="space-y-1 rounded-md bg-quasar-gray-light/40 p-2 text-xs">
              {c.restituiri.map((r) => (
                <li key={r.id}>
                  {formatDate(r.created)} · {formatRON(r.suma)} ·{' '}
                  {r.status === 'efectuata' ? 'restituit' : r.status === 'esuata' ? 'nereușită' : 'neterminată'}
                  {r.mod === 'manual' ? ' (din panoul Netopia)' : ''} — {r.motiv}
                  {r.fgo_status ? ` · ${FGO_TEXT[r.fgo_status]}` : ''}
                  {r.fgo_storno ? ` (${r.fgo_storno})` : ''}
                </li>
              ))}
            </ul>
          )}

          {inCurs ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p>
                O restituire de <strong>{formatRON(inCurs.suma)}</strong> a rămas neterminată
                {inCurs.eroare ? `: ${inCurs.eroare}` : '.'}
              </p>
              <p className="text-quasar-gray">
                Caută tranzacția în panoul Netopia și spune ce s-a întâmplat. Până atunci nu se poate
                face altă restituire pe comanda asta.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={() => inchide.mutate(true)}>
                  Banii au plecat — înregistrează
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => inchide.mutate(false)}>
                  Returul nu s-a făcut
                </Button>
              </div>
            </div>
          ) : ramas <= 0 ? (
            <p className="text-sm text-quasar-gray">Plata a fost restituită integral.</p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="restituire-mod"
                    className="mt-0.5"
                    checked={mod === 'netopia'}
                    disabled={!c.areNtpId}
                    onChange={() => setMod('netopia')}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-quasar-black">Cere returul la Netopia acum</span>
                    <span className="block text-xs text-quasar-gray">
                      {c.areNtpId
                        ? 'Banii se întorc pe cardul cu care s-a plătit.'
                        : 'Comanda n-are id de tranzacție Netopia — fă returul din panou.'}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="restituire-mod"
                    className="mt-0.5"
                    checked={mod === 'manual'}
                    onChange={() => setMod('manual')}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-quasar-black">Am făcut deja returul în panoul Netopia</span>
                    <span className="block text-xs text-quasar-gray">
                      Aplicația doar înregistrează ce s-a întâmplat acolo.
                    </span>
                  </span>
                </label>
              </div>

              <Field label={`Sumă (RON, cel mult ${ramas})`} required htmlFor="restituire-suma">
                <TextInput
                  id="restituire-suma"
                  type="number"
                  min={0}
                  step="0.01"
                  value={suma}
                  onChange={(e) => setSuma(e.target.value)}
                />
              </Field>

              <Field label="Motiv (obligatoriu)" required htmlFor="restituire-motiv">
                <TextArea
                  id="restituire-motiv"
                  rows={2}
                  value={motiv}
                  onChange={(e) => setMotiv(e.target.value)}
                  placeholder="Ex: a plătit de două ori, o dată cash la recepție."
                />
              </Field>

              <ul className="list-disc space-y-0.5 pl-5 text-xs text-quasar-gray">
                <li>Se scrie o încasare de −{formatRON(Number(suma) || 0)} pe aceleași rânduri, cu urmă în audit.</li>
                {c.order_type === 'rezervare' && Number(suma) >= ramas - 0.004 && (
                  <li>Rezervarea Open class se anulează și locul se eliberează.</li>
                )}
                {c.order_type === 'abonament' && (
                  <li>Cursul rămâne cum e; dacă nu mai e plătit altfel, apare ca restanță.</li>
                )}
                <li>
                  {integral
                    ? c.factura
                      ? `Factura ${c.factura} se stornează automat în FGO.`
                      : 'Comanda n-are factură FGO de stornat.'
                    : 'Restituire parțială: factura se stornează manual în FGO (API-ul stornează doar integral).'}
                </li>
              </ul>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
