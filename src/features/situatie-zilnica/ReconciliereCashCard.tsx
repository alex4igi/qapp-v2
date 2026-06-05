import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Field,
  TextInput,
  TextArea,
  Button,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import {
  DENOMINATII,
  getFondAnterior,
  getReconciliereZi,
  totalDinDenominatii,
  upsertReconciliere,
  type DenominatiiMap,
} from './api'

type Props = {
  data: string
  locatieId: string
  locatieNume: string
  cashSistem: number
}

function emptyDenominatii(): DenominatiiMap {
  return DENOMINATII.reduce<DenominatiiMap>((acc, v) => {
    acc[String(v)] = 0
    return acc
  }, {})
}

export function ReconciliereCashCard({
  data,
  locatieId,
  locatieNume,
  cashSistem,
}: Props) {
  const queryClient = useQueryClient()

  const reconQ = useQuery({
    queryKey: ['recon-cash', data, locatieId],
    queryFn: () => getReconciliereZi(data, locatieId),
  })

  const fondAnteriorQ = useQuery({
    queryKey: ['recon-cash-fond', data, locatieId],
    queryFn: () => getFondAnterior(data, locatieId),
    enabled: !reconQ.data,
  })

  const [denominatii, setDenominatii] = useState<DenominatiiMap>(emptyDenominatii)
  const [fondInceput, setFondInceput] = useState('')
  const [deDepus, setDeDepus] = useState('')
  const [notite, setNotite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (reconQ.data) {
      const d = (reconQ.data.denominatii ?? {}) as DenominatiiMap
      setDenominatii({ ...emptyDenominatii(), ...d })
      setFondInceput(String(Number(reconQ.data.fond_inceput ?? 0)))
      setDeDepus(String(Number(reconQ.data.de_depus ?? 0)))
      setNotite(reconQ.data.notite ?? '')
      setSaved(true)
    } else if (fondAnteriorQ.data != null) {
      setFondInceput(String(fondAnteriorQ.data))
      setSaved(false)
    }
  }, [reconQ.data, fondAnteriorQ.data])

  const totalNumarat = useMemo(
    () => totalDinDenominatii(denominatii),
    [denominatii],
  )
  const fondInceputNum = Number(fondInceput) || 0
  const deDepusNum = Number(deDepus) || 0
  const diferenta = totalNumarat - (fondInceputNum + cashSistem)
  const fondRamas = totalNumarat - deDepusNum

  const setDenom = (v: number, n: string) => {
    const num = Math.max(0, Math.round(Number(n) || 0))
    setDenominatii((prev) => ({ ...prev, [String(v)]: num }))
    setSaved(false)
  }

  const mut = useMutation({
    mutationFn: () => {
      if (deDepusNum > totalNumarat) {
        throw new Error('Suma de depus nu poate depăși totalul numărat.')
      }
      return upsertReconciliere({
        data,
        locatie: locatieId,
        denominatii,
        total_numarat: totalNumarat,
        total_sistem: cashSistem,
        fond_inceput: fondInceputNum,
        de_depus: deDepusNum,
        fond_ramas: fondRamas,
        notite: notite.trim() || null,
      })
    },
    onSuccess: () => {
      setSaved(true)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['recon-cash'] })
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const diferentaTone =
    diferenta === 0
      ? 'text-green-700'
      : diferenta > 0
        ? 'text-amber-600'
        : 'text-red-600'

  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-quasar-black">
          Reconciliere cash —{' '}
          <span className="font-normal text-quasar-gray">
            {locatieNume} · {data}
          </span>
        </h2>
        {saved && (
          <span className="text-xs text-green-700">✓ Salvat</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
            Bancnote/monede în casă
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-quasar-gray-light text-left text-xs text-quasar-gray">
                <th className="py-1 font-medium">Valoare</th>
                <th className="py-1 font-medium">Bucăți</th>
                <th className="py-1 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {DENOMINATII.map((v) => {
                const n = Number(denominatii[String(v)] ?? 0)
                return (
                  <tr key={v} className="border-b border-quasar-gray-light/60">
                    <td className="py-1.5 font-medium">{v} RON</td>
                    <td className="py-1.5 w-24">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={n}
                        onChange={(e) => setDenom(v, e.target.value)}
                        className="w-full rounded border border-quasar-gray-light px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      {n > 0 ? formatRON(v * n) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-2 text-right text-sm font-medium">
                  Total numărat:
                </td>
                <td className="pt-2 text-right text-base font-bold text-quasar-black">
                  {formatRON(totalNumarat)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-quasar-gray">
            Verificare & decizii
          </h3>

          <div className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/30 p-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span>Cash în sistem (azi)</span>
              <span className="font-medium">{formatRON(cashSistem)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>+ Fond de la ieri</span>
              <span className="font-medium">{formatRON(fondInceputNum)}</span>
            </div>
            <div className="flex justify-between border-t border-quasar-gray-light pt-1.5">
              <span>= Ar trebui în casă</span>
              <span className="font-semibold">
                {formatRON(cashSistem + fondInceputNum)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Numărat efectiv</span>
              <span className="font-medium">{formatRON(totalNumarat)}</span>
            </div>
            <div
              className={`mt-1 flex justify-between border-t border-quasar-gray-light pt-1.5 ${diferentaTone}`}
            >
              <span className="font-medium">Diferență</span>
              <span className="font-bold">
                {diferenta > 0 ? '+' : ''}
                {formatRON(diferenta)}
                {diferenta === 0
                  ? '  ✓'
                  : diferenta > 0
                    ? '  (surplus)'
                    : '  (lipsă)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fond start zi (RON)" htmlFor="rc-fond-i">
              <TextInput
                id="rc-fond-i"
                type="number"
                min={0}
                value={fondInceput}
                onChange={(e) => {
                  setFondInceput(e.target.value)
                  setSaved(false)
                }}
              />
            </Field>
            <Field label="De depus la bancă (RON)" htmlFor="rc-depus">
              <TextInput
                id="rc-depus"
                type="number"
                min={0}
                value={deDepus}
                onChange={(e) => {
                  setDeDepus(e.target.value)
                  setSaved(false)
                }}
              />
            </Field>
          </div>

          <div className="rounded-md bg-quasar-yellow/40 px-3 py-2 text-sm">
            <span>Fond rămas pentru mâine: </span>
            <span className="font-bold text-quasar-black">
              {formatRON(fondRamas)}
            </span>
          </div>

          <Field label="Notițe" htmlFor="rc-notite">
            <TextArea
              id="rc-notite"
              rows={2}
              value={notite}
              onChange={(e) => {
                setNotite(e.target.value)
                setSaved(false)
              }}
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || saved}
            >
              {mut.isPending
                ? 'Se salvează…'
                : saved
                  ? '✓ Salvat'
                  : 'Salvează reconcilierea'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
