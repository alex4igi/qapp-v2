import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, TextInput, Select, Combobox, Button, Spinner } from '@/components/ui'
import { clientiOptions, teacheriOptions, sezonActivId } from '@/lib/lookups'
import { metodaPlataOptions } from '@/lib/enums'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { VacantaWarning } from '@/features/shared/VacantaWarning'
import { formatRON } from '@/lib/format'
import type { Curs, Enums } from '@/types/db'
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
  const [metoda, setMetoda] = useState<Enums<'metoda_plata'>>('Cash')
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
  const teacheriQ = useQuery({ queryKey: ['lookup', 'teacheri'], queryFn: teacheriOptions })

  const cursSelectat = useMemo(
    () => cursuriQ.data?.find((c) => c.id === cursId) ?? null,
    [cursuriQ.data, cursId],
  )

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
      const sumaNum = Number(suma)
      if (!suma.trim() || !isFinite(sumaNum) || sumaNum <= 0) {
        throw new Error('Suma este obligatorie și pozitivă.')
      }
      if (!locatieId) {
        throw new Error('Setează locația de lucru din bara de sus (📍 lângă dată).')
      }
      return rezervaLocOpen({
        clientId,
        suma: sumaNum,
        metoda,
        locatieId,
        sesiuneId: ocupare?.sesiune?.id ?? null,
        cursId,
        data,
        instructorId: instructorId || null,
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
      setError(e instanceof Error ? e.message : 'Eroare la rezervare.'),
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
          <TextInput
            type="date"
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
        <Field label="Sumă (RON)" required>
          <TextInput
            type="number"
            min={0}
            step="0.01"
            value={suma}
            onChange={(e) => {
              setSuma(e.target.value)
              setSumaTouched(true)
            }}
          />
        </Field>
        <Field label="Metoda de plată">
          <Select
            options={metodaPlataOptions}
            value={metoda}
            onChange={(e) => setMetoda(e.target.value as Enums<'metoda_plata'>)}
          />
        </Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-quasar-gray-light pt-3">
        <div className="mr-auto text-sm">
          <span className="text-quasar-gray">Total:</span>{' '}
          <span className="font-semibold text-quasar-black">
            {formatRON(Number(suma) || 0)}
          </span>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Anulează
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || plin}
        >
          {mutation.isPending ? 'Se rezervă…' : plin ? 'Sesiune completă' : 'Rezervă + încasează'}
        </Button>
      </div>
    </div>
  )
}
