import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Field,
  TextInput,
  TextArea,
  Select,
  Combobox,
  Checkbox,
  Button,
} from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { metodaPlataOptions } from '@/lib/enums'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { formatRON } from '@/lib/format'
import { listAvailableVouchere } from '@/features/vouchere/api'
import { applyVoucher } from '@/features/vouchere/calc'
import type { Enums, InsertDto, Voucher } from '@/types/db'
import {
  createIncasare,
  listBiletSurse,
  listInventarOptiuni,
  resolveWorkshopGuest,
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

function voucherLabel(v: Voucher): string {
  const val =
    v.tip === 'Procent' ? `${v.valoare}%` : `${v.valoare} RON`
  return `${v.cod_voucher} — ${val}`
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
  const [voucherId, setVoucherId] = useState('')
  const [guestMode, setGuestMode] = useState(false)
  const [guestNume, setGuestNume] = useState('')
  const [guestTelefon, setGuestTelefon] = useState('')
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

  // Doar vouchere universale (nelegate de un curs anume) au sens pe plăți simple.
  const vouchereQ = useQuery({
    queryKey: ['vouchere-disponibile', 'simple'],
    queryFn: () => listAvailableVouchere({ activeOnly: true }),
    select: (rows) => rows.filter((v) => !v.curs),
  })

  const selectedBilet = useMemo(
    () => biletSurseQ.data?.find((s) => s.value === sursaId),
    [biletSurseQ.data, sursaId],
  )
  const selectedInventar = useMemo(
    () => inventarQ.data?.find((i) => i.value === sursaId),
    [inventarQ.data, sursaId],
  )
  const isWorkshop = tip === 'Bilet' && (selectedBilet?.isWorkshop ?? false)

  const voucherSelectat = useMemo(
    () => vouchereQ.data?.find((v) => v.id === voucherId) ?? null,
    [vouchereQ.data, voucherId],
  )
  const sumaNum = Number(suma) || 0
  const preview = applyVoucher(sumaNum, voucherSelectat)

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
      const sumaInput = Number(suma)
      if (!suma.trim() || !isFinite(sumaInput) || sumaInput <= 0) {
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

      // La workshop, persoana e obligatorie: client existent SAU guest (nume+telefon).
      let clientField: string | null = clientId || null
      let leadField: string | null = null
      if (isWorkshop) {
        if (guestMode) {
          if (!guestNume.trim() || !guestTelefon.trim()) {
            throw new Error('Pentru guest, completează nume și telefon.')
          }
          const res = await resolveWorkshopGuest({
            nume: guestNume,
            telefon: guestTelefon,
            evenimentNume: selectedBilet?.nume ?? null,
          })
          if (res.kind === 'client') clientField = res.clientId
          else leadField = res.leadId
        } else if (!clientId) {
          throw new Error(
            'Alege clientul sau bifează „participant din afara clubului".',
          )
        }
      }

      const payload: InsertDto<'incasari'> = {
        client: clientField,
        lead: leadField,
        locatie: locatieId,
        suma: applyVoucher(sumaInput, voucherSelectat).sumaFinala,
        data: data || null,
        metoda,
        observatii: observatii.trim() || null,
        categorie: isWorkshop ? 'Workshop' : tip,
        voucher: voucherId || null,
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
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const labels: Record<SimpleTip, { sursa: string; placeholder: string }> = {
    Bilet: {
      sursa: 'Eveniment / Concurs / Workshop',
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

      {isWorkshop ? (
        <div className="space-y-3 rounded-md border border-quasar-gray-light p-3">
          <Checkbox
            label="Participant din afara clubului (guest nou)"
            checked={guestMode}
            onChange={(e) => setGuestMode(e.target.checked)}
          />
          {guestMode ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nume guest" required>
                <TextInput
                  value={guestNume}
                  onChange={(e) => setGuestNume(e.target.value)}
                />
              </Field>
              <Field label="Telefon guest" required>
                <TextInput
                  value={guestTelefon}
                  onChange={(e) => setGuestTelefon(e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <Field label="Cursant" required>
              <Combobox
                placeholder="Caută cursant (nume sau telefon)…"
                options={clientiQ.data ?? []}
                value={clientId}
                onChange={(v) => setClientId(v)}
              />
            </Field>
          )}
        </div>
      ) : (
        <Field label="Cursant (opțional)">
          <Combobox
            placeholder="Caută cursant (nume sau telefon)…"
            options={clientiQ.data ?? []}
            value={clientId}
            onChange={(v) => setClientId(v)}
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
        <Field label="Voucher (opțional)">
          <Select
            placeholder="Fără voucher"
            options={(vouchereQ.data ?? []).map((v) => ({
              label: voucherLabel(v),
              value: v.id,
            }))}
            value={voucherId}
            onChange={(e) => setVoucherId(e.target.value)}
          />
          {voucherSelectat?.descriere && (
            <p className="mt-1 text-xs text-quasar-gray">
              {voucherSelectat.descriere}
            </p>
          )}
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
          {voucherSelectat && preview.discount > 0 ? (
            <span className="text-quasar-gray">
              {formatRON(sumaNum)} − {formatRON(preview.discount)} ={' '}
              <span className="font-semibold text-quasar-black">
                {formatRON(preview.sumaFinala)}
              </span>
            </span>
          ) : (
            <>
              <span className="text-quasar-gray">Total:</span>{' '}
              <span className="font-semibold text-quasar-black">
                {formatRON(preview.sumaFinala)}
              </span>
            </>
          )}
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
