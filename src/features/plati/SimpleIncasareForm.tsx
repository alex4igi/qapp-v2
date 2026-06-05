import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Field,
  TextInput,
  TextArea,
  Select,
  Combobox,
  Button,
} from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { metodaPlataOptions } from '@/lib/enums'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { formatRON } from '@/lib/format'
import type { Enums, InsertDto } from '@/types/db'
import {
  createIncasare,
  listBiletSurse,
  listInventarOptiuni,
} from './api'

export type SimpleTip = 'Bilet' | 'Merch' | 'Taxa'

type Props = {
  tip: SimpleTip
  onClose: () => void
  defaultClientId?: string
}

function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function parsePret(p: string | null | undefined): number | null {
  if (!p) return null
  const n = Number(String(p).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return isFinite(n) && n > 0 ? n : null
}

export function SimpleIncasareForm({ tip, onClose, defaultClientId }: Props) {
  const queryClient = useQueryClient()
  const { locatieId, locatieNume } = useWorkingLocatie()

  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [sursaId, setSursaId] = useState('') // bilet/inventar id
  const [bucati, setBucati] = useState('1')
  const [suma, setSuma] = useState('')
  const [data, setData] = useState(todayIso())
  const [metoda, setMetoda] = useState<Enums<'metoda_plata'>>('Cash')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })

  const biletSurseQ = useQuery({
    queryKey: ['lookup', 'bilet-surse'],
    queryFn: listBiletSurse,
    enabled: tip === 'Bilet',
  })

  const inventarQ = useQuery({
    queryKey: ['lookup', 'inventar-optiuni'],
    queryFn: listInventarOptiuni,
    enabled: tip === 'Merch',
  })

  const selectedBilet = useMemo(
    () => biletSurseQ.data?.find((s) => s.value === sursaId),
    [biletSurseQ.data, sursaId],
  )
  const selectedInventar = useMemo(
    () => inventarQ.data?.find((i) => i.value === sursaId),
    [inventarQ.data, sursaId],
  )

  // Auto-completează suma pe baza pretului din sursă × bucăți, doar dacă userul n-a editat
  const [sumaTouched, setSumaTouched] = useState(false)
  useEffect(() => {
    if (sumaTouched) return
    if (tip === 'Bilet' && selectedBilet?.pret != null) {
      const total = Number(selectedBilet.pret) * (Number(bucati) || 1)
      setSuma(total > 0 ? String(total) : '')
    } else if (tip === 'Merch') {
      const unit = parsePret(selectedInventar?.pret)
      if (unit != null) {
        const total = unit * (Number(bucati) || 1)
        setSuma(total > 0 ? String(total) : '')
      }
    }
  }, [tip, selectedBilet, selectedInventar, bucati, sumaTouched])

  const mutation = useMutation({
    mutationFn: async () => {
      const sumaNum = Number(suma)
      if (!suma.trim() || !isFinite(sumaNum) || sumaNum <= 0) {
        throw new Error('Suma este obligatorie și pozitivă.')
      }
      if (tip === 'Bilet' && !sursaId) {
        throw new Error('Alege un eveniment sau concurs.')
      }
      if (tip === 'Merch' && !sursaId) {
        throw new Error('Alege un articol din inventar.')
      }
      if (tip === 'Taxa' && !observatii.trim()) {
        throw new Error('Adaugă o scurtă descriere a taxei (în Observații).')
      }
      if (!locatieId) {
        throw new Error(
          'Setează locația de lucru din bara de sus (📍 lângă data).',
        )
      }

      const payload: InsertDto<'incasari'> = {
        client: clientId || null,
        locatie: locatieId,
        suma: sumaNum,
        data: data || null,
        metoda,
        observatii: observatii.trim() || null,
        categorie: tip,
      }
      if (tip === 'Bilet') {
        payload.bilet = sursaId
      } else if (tip === 'Merch') {
        payload.articol_inventar = sursaId
        const buc = Number(bucati)
        payload.bucati = isFinite(buc) && buc > 0 ? Math.round(buc) : 1
      }
      return createIncasare(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['stat'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const labels: Record<SimpleTip, { sursa: string; placeholder: string }> = {
    Bilet: {
      sursa: 'Eveniment / Concurs',
      placeholder: 'Alege sursa biletului…',
    },
    Merch: {
      sursa: 'Articol din inventar',
      placeholder: 'Alege articolul…',
    },
    Taxa: { sursa: '', placeholder: '' },
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-quasar-gray-light/30 px-3 py-2 text-xs text-quasar-gray">
        📍 Se înregistrează la <strong className="text-quasar-black">{locatieNume ?? 'fără locație setată'}</strong>
        {' '}— schimbă din bara de sus dacă e altă recepție.
      </div>

      <Field label="Cursant (opțional)">
        <Combobox
          placeholder="Caută cursant (nume sau telefon)…"
          options={clientiQ.data ?? []}
          value={clientId}
          onChange={(v) => setClientId(v)}
        />
      </Field>


      {tip === 'Bilet' && (
        <Field label={labels.Bilet.sursa} required>
          <Select
            placeholder={labels.Bilet.placeholder}
            options={biletSurseQ.data ?? []}
            value={sursaId}
            onChange={(e) => {
              setSursaId(e.target.value)
              setSumaTouched(false)
            }}
          />
        </Field>
      )}

      {tip === 'Merch' && (
        <Field label={labels.Merch.sursa} required>
          <Select
            placeholder={labels.Merch.placeholder}
            options={inventarQ.data ?? []}
            value={sursaId}
            onChange={(e) => {
              setSursaId(e.target.value)
              setSumaTouched(false)
            }}
          />
          {selectedInventar?.stoc != null && (
            <p className="mt-1 text-xs text-quasar-gray">
              Stoc curent: {selectedInventar.stoc}
            </p>
          )}
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        {(tip === 'Bilet' || tip === 'Merch') && (
          <Field label="Bucăți">
            <TextInput
              type="number"
              min={1}
              value={bucati}
              onChange={(e) => {
                setBucati(e.target.value)
                setSumaTouched(false)
              }}
            />
          </Field>
        )}
        <Field label="Sumă totală (RON)" required>
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
        <Field label="Data">
          <TextInput
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Metoda de plată">
          <Select
            options={metodaPlataOptions}
            value={metoda}
            onChange={(e) =>
              setMetoda(e.target.value as Enums<'metoda_plata'>)
            }
          />
        </Field>
      </div>

      <Field
        label={tip === 'Taxa' ? 'Descriere taxă (obligatoriu)' : 'Observații'}
        required={tip === 'Taxa'}
      >
        <TextArea
          rows={2}
          value={observatii}
          onChange={(e) => setObservatii(e.target.value)}
        />
      </Field>

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
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Se înregistrează…' : 'Înregistrează plata'}
        </Button>
      </div>
    </div>
  )
}
