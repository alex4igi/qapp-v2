import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, TextInput, DateInput, Select, Combobox, Button, Spinner } from '@/components/ui'
import { clientiOptions, sezonActivId } from '@/lib/lookups'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { VacantaWarning } from '@/features/shared/VacantaWarning'
import { formatRON } from '@/lib/format'
import type { Curs } from '@/types/db'
import { MetodaPlataField, resolveTenders, type MetodaSel } from './MetodaPlataField'
import {
  listCursuriFacultative,
  getOpenSesiuneByDate,
  listRezervariSesiune,
  rezervaLocOpen,
} from '../../api'
import { todayIso } from './helpers'

type Props = {
  onClose: () => void
  defaultClientId?: string
}

export function OpenClassTab({ onClose, defaultClientId }: Props) {
  const queryClient = useQueryClient()
  const { locatieId, locatieNume } = useWorkingLocatie()

  const [cursId, setCursId] = useState('')
  const [data, setData] = useState('')
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [instructorId, setInstructorId] = useState('')
  const [suma, setSuma] = useState('')
  const [sumaTouched, setSumaTouched] = useState(false)
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [overbook, setOverbook] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })
  const cursuriQ = useQuery<Curs[]>({
    queryKey: ['cursuri-facultative', locatieId, sezonActivQ.data ?? null],
    queryFn: () => listCursuriFacultative(locatieId, sezonActivQ.data ?? null),
    enabled: sezonActivQ.isSuccess,
  })
  const clientiQ = useQuery({ queryKey: ['lookup', 'clienti'], queryFn: clientiOptions })
  const teacheriQ = useTeacheriOptions()

  const cursSelectat = useMemo(
    () => cursuriQ.data?.find((c) => c.id === cursId) ?? null,
    [cursuriQ.data, cursId],
  )
  const pret = cursSelectat?.pret_sedinta ?? null
  const incasat = Number(suma) || 0
  const rest = pret != null ? Math.max(0, pret - incasat) : 0

  // Ocuparea sesiunii (curs + dată), reîncărcată la schimbarea oricăruia.
  const sesiuneQ = useQuery({
    queryKey: ['open-sesiune', cursId, data],
    queryFn: () => getOpenSesiuneByDate(cursId, data),
    enabled: Boolean(cursId && data),
  })
  const rezervariQ = useQuery({
    queryKey: ['open-rezervari', sesiuneQ.data?.sesiune?.id],
    queryFn: () => listRezervariSesiune(sesiuneQ.data!.sesiune!.id),
    enabled: Boolean(sesiuneQ.data?.sesiune?.id),
  })

  const ocupare = sesiuneQ.data
  const plin = ocupare ? ocupare.ocupate >= ocupare.capacitate : false

  // Preț sugerat din curs (pret_sedinta), doar dacă userul n-a editat.
  useEffect(() => {
    if (sumaTouched) return
    setSuma(cursSelectat?.pret_sedinta != null ? String(cursSelectat.pret_sedinta) : '')
  }, [cursSelectat, sumaTouched])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cursId) throw new Error('Alege cursul OPEN.')
      if (!data) throw new Error('Alege data sesiunii.')
      if (data < todayIso()) throw new Error('Sesiunea nu poate fi în trecut.')
      if (!clientId) throw new Error('Alege cursantul.')
      if (pret == null || !(pret > 0)) {
        throw new Error('Cursul nu are preț pe ședință configurat.')
      }
      const sumaNum = Number(suma) || 0
      if (!isFinite(sumaNum) || sumaNum < 0) {
        throw new Error('Suma încasată este invalidă.')
      }
      if (sumaNum > pret + 0.001) {
        throw new Error('Suma încasată depășește prețul.')
      }
      if (!locatieId) {
        throw new Error('Setează locația de lucru din bara de sus (📍 lângă dată).')
      }
      // Încasare 0 → fără tenders (nicio metodă cerută); restul rămâne restanță.
      const tenders = sumaNum > 0 ? resolveTenders({ metoda, total: sumaNum, cash, card }) : []
      const [t0, t1] = tenders
      return rezervaLocOpen({
        clientId,
        suma: t0?.suma ?? 0,
        metoda: t0?.metoda ?? 'Cash',
        metoda2: t1?.metoda ?? null,
        suma2: t1?.suma ?? null,
        pret,
        locatieId,
        sesiuneId: ocupare?.sesiune?.id ?? null,
        cursId,
        data,
        instructorId: instructorId || null,
        permiteOverbook: overbook,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['open-sesiune'] })
      void queryClient.invalidateQueries({ queryKey: ['open-sesiuni'] })
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la rezervare.')),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-quasar-gray-light/30 px-3 py-2 text-xs text-quasar-gray">
        📍 Se înregistrează la{' '}
        <strong className="text-quasar-black">{locatieNume ?? 'fără locație setată'}</strong>
        {' '}— rezervare loc + plată la o sesiune OPEN viitoare.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Curs OPEN (facultativ)" required>
          <Combobox
            placeholder={
              cursuriQ.data && cursuriQ.data.length === 0
                ? '— niciun curs facultativ —'
                : '— alege curs —'
            }
            options={(cursuriQ.data ?? []).map((c) => ({ value: c.id, label: c.numele }))}
            value={cursId}
            onChange={(v) => {
              setCursId(v)
              setSumaTouched(false)
            }}
          />
        </Field>
        <Field label="Data sesiunii" required>
          <DateInput
            min={todayIso()}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Field>
      </div>

      <VacantaWarning data={data} />

      {cursId && data && (
        <div className="rounded-md border border-quasar-gray-light p-3">
          {sesiuneQ.isLoading ? (
            <Spinner />
          ) : ocupare ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-quasar-gray">Locuri ocupate</span>
                <span
                  className={[
                    'font-semibold',
                    plin ? 'text-red-600' : 'text-quasar-black',
                  ].join(' ')}
                >
                  {ocupare.ocupate} / {ocupare.capacitate}
                  {plin && ' — complet'}
                </span>
              </div>
              {(rezervariQ.data?.length ?? 0) > 0 && (
                <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-quasar-gray">
                  {rezervariQ.data!.map((r) => (
                    <li key={r.id}>
                      • {r.nume} {r.prenume ?? ''}
                    </li>
                  ))}
                </ul>
              )}
              {plin && (
                <label className="mt-2 flex items-center gap-2 text-xs text-quasar-black">
                  <input
                    type="checkbox"
                    checked={overbook}
                    onChange={(e) => setOverbook(e.target.checked)}
                  />
                  Adaugă peste limită (walk-in la sală)
                </label>
              )}
            </>
          ) : null}
        </div>
      )}

      <Field label="Cursant" required>
        <Combobox
          placeholder="Caută cursant (nume sau telefon)…"
          options={clientiQ.data ?? []}
          value={clientId}
          onChange={(v) => setClientId(v)}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Instructor sesiune (opțional)">
          <Select
            placeholder="— neatribuit —"
            options={teacheriQ.data ?? []}
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
          />
        </Field>
        <Field label="Încasează acum (RON)">
          <TextInput
            type="number"
            min={0}
            max={pret ?? undefined}
            step="0.01"
            value={suma}
            onChange={(e) => {
              setSuma(e.target.value)
              setSumaTouched(true)
            }}
          />
          {pret != null && (
            <p className="mt-1 text-xs text-quasar-gray">
              Preț: <strong className="text-quasar-black">{formatRON(pret)}</strong>
              {rest > 0 && (
                <> · rest <strong className="text-quasar-black">{formatRON(rest)}</strong> (restanță)</>
              )}
            </p>
          )}
        </Field>
        {incasat > 0 && (
          <MetodaPlataField
            metoda={metoda}
            onMetoda={setMetoda}
            total={incasat}
            cash={cash}
            card={card}
            onCash={setCash}
            onCard={setCard}
          />
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-quasar-gray-light pt-3">
        <div className="mr-auto text-sm">
          <span className="text-quasar-gray">Încasează:</span>{' '}
          <span className="font-semibold text-quasar-black">
            {formatRON(incasat)}
          </span>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Anulează
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || (plin && !overbook)}
        >
          {mutation.isPending
            ? 'Se rezervă…'
            : plin && !overbook
              ? 'Sesiune completă'
              : incasat > 0
                ? 'Rezervă + încasează'
                : 'Rezervă (fără plată)'}
        </Button>
      </div>
    </div>
  )
}
