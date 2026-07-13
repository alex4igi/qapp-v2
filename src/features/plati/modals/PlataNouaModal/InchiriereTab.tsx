import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Combobox,
  Button,
} from '@/components/ui'
import { clientiOptions, locatiiOptions, saliOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import { formatRON } from '@/lib/format'
import { computePret, computeOraFinal, type TarifBracket } from '@/lib/inchirieriPricing'
import type { Enums } from '@/types/db'
import {
  checkInchiriereConflict,
  createInchiriere,
  listTarifeInchiriere,
  type InchiriereRenter,
} from '../../api'
import { todayIso } from './helpers'
import { MetodaPlataField, resolveTenders, type MetodaSel } from './MetodaPlataField'

export type DefaultInchiriere = {
  locatie?: string
  sala?: string
  data?: string
  oraStart?: string
}

type Props = {
  onClose: () => void
  defaultInchiriere?: DefaultInchiriere
}

type RenterKind = 'teacher' | 'client' | 'guest'

// Durate rapide (min). Pentru altă durată → Select-ul „Altă durată" (pași de 30).
const DURATE_RAPIDE = [60, 90, 120]
const DURATE_TOATE = [30, 60, 90, 120, 150, 180, 210, 240]

const RENTER_LABEL: Record<RenterKind, string> = {
  teacher: 'Teacher',
  client: 'Client',
  guest: 'Guest',
}

export function InchiriereTab({ onClose, defaultInchiriere }: Props) {
  const queryClient = useQueryClient()
  const { locatieId: workLocatieId, locatieNume } = useWorkingLocatie()

  const [locatie, setLocatie] = useState(defaultInchiriere?.locatie ?? workLocatieId ?? '')
  const [sala, setSala] = useState(defaultInchiriere?.sala ?? '')
  const [data, setData] = useState(defaultInchiriere?.data ?? todayIso())
  const [oraStart, setOraStart] = useState(defaultInchiriere?.oraStart ?? '')
  const [durataMin, setDurataMin] = useState(60)

  const [renterKind, setRenterKind] = useState<RenterKind>('teacher')
  const [teacherId, setTeacherId] = useState('')
  const [teacherFree, setTeacherFree] = useState(true)
  const [clientId, setClientId] = useState('')
  const [guestNume, setGuestNume] = useState('')
  const [guestTel, setGuestTel] = useState('')

  const [incasat, setIncasat] = useState('')
  const [incasatTouched, setIncasatTouched] = useState(false)
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  const locatiiQ = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const saliQ = useQuery({
    queryKey: ['lookup', 'sali', locatie],
    queryFn: () => saliOptions(locatie),
    enabled: Boolean(locatie),
  })
  const teacheriQ = useTeacheriOptions()
  const clientiQ = useQuery({ queryKey: ['lookup', 'clienti'], queryFn: clientiOptions })
  const tarifeQ = useQuery({ queryKey: ['tarife-inchiriere'], queryFn: listTarifeInchiriere })

  const salaNume = useMemo(
    () => saliQ.data?.find((s) => s.value === sala)?.label ?? '',
    [saliQ.data, sala],
  )

  const tier: Enums<'tier_inchiriere'> = renterKind === 'teacher' ? 'staff' : 'client'
  const isFreePractice = renterKind === 'teacher' && teacherFree

  const tarif = useMemo<TarifBracket | null>(() => {
    const row = tarifeQ.data?.find((t) => t.sala === sala && t.tier === tier)
    return row ?? null
  }, [tarifeQ.data, sala, tier])

  const pret = isFreePractice ? 0 : computePret(tarif, durataMin)
  const oraFinal = computeOraFinal(oraStart, durataMin)
  const tarifLipsa = !isFreePractice && sala !== '' && pret == null

  // Default „Încasează acum" = prețul, până când recepția îl editează.
  const pretNum = pret ?? 0
  const incasatDefault = incasatTouched ? incasat : pretNum > 0 ? String(pretNum) : '0'
  const collected = Math.min(Math.max(0, Number(incasatDefault) || 0), pretNum)
  const rest = Math.max(0, pretNum - collected)

  // Verificare conflict live (interval overlap cu cursuri + închirieri).
  const conflictQ = useQuery({
    queryKey: ['inchiriere-conflict', sala, data, oraStart, durataMin],
    queryFn: () =>
      checkInchiriereConflict({ sala, data, oraStart, durataMin }),
    enabled: Boolean(sala && data && oraStart && durataMin),
  })
  const conflict = conflictQ.data ?? null

  const tierLabel = isFreePractice ? 'Gratis (antrenament)' : tier === 'staff' ? 'Staff' : 'Client'
  const renterName = useMemo(() => {
    if (renterKind === 'teacher') return teacheriQ.data?.find((t) => t.value === teacherId)?.label ?? ''
    if (renterKind === 'client') return clientiQ.data?.find((c) => c.value === clientId)?.label ?? ''
    return guestNume.trim()
  }, [renterKind, teacherId, clientId, guestNume, teacheriQ.data, clientiQ.data])

  const reset = () => {
    setSala('')
    setOraStart('')
    setDurataMin(60)
    setRenterKind('teacher')
    setTeacherId('')
    setTeacherFree(true)
    setClientId('')
    setGuestNume('')
    setGuestTel('')
    setIncasat('')
    setIncasatTouched(false)
    setMetoda('Cash')
    setCash('')
    setCard('')
    setObservatii('')
    setError(null)
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!locatie) throw new Error('Alege locația.')
      if (!sala) throw new Error('Alege sala.')
      if (!data) throw new Error('Alege data.')
      if (!oraStart) throw new Error('Alege ora de start.')
      if (!oraFinal) throw new Error('Oră de start invalidă.')
      if (conflict) {
        throw new Error(
          `Interval ocupat (${conflict.kind === 'curs' ? 'curs' : 'închiriere'}: ${conflict.label} ${conflict.ora_start}-${conflict.ora_final}).`,
        )
      }

      let renter: InchiriereRenter
      if (renterKind === 'teacher') {
        if (!teacherId) throw new Error('Alege teacherul.')
        renter = { kind: 'teacher', teacherId, freePractice: teacherFree }
      } else if (renterKind === 'client') {
        if (!clientId) throw new Error('Alege clientul.')
        renter = { kind: 'client', clientId }
      } else {
        if (!guestNume.trim() || !guestTel.trim())
          throw new Error('Pentru guest, completează nume și telefon.')
        renter = { kind: 'guest', nume: guestNume, tel: guestTel }
      }

      if (!isFreePractice && pret == null) {
        throw new Error('Tarif nesetat pentru această sală — completează-l în Setări.')
      }
      // Guest (walk-in fără cont) achită integral pe loc; doar teacher/client pot amâna.
      if (rest > 0 && renterKind === 'guest') {
        throw new Error('Guest trebuie să achite integral pe loc.')
      }
      if (!workLocatieId) {
        throw new Error('Setează locația de lucru din bara de sus (📍 lângă dată).')
      }

      const descriere = `Închiriere ${salaNume} · ${data} ${oraStart}-${oraFinal} · ${RENTER_LABEL[renterKind]}${renterName ? ` ${renterName}` : ''}`
      const tenders = collected > 0 ? resolveTenders({ metoda, total: collected, cash, card }) : []

      return createInchiriere({
        sala,
        locatie,
        data,
        oraStart,
        durataMin,
        tier,
        renter,
        pret: pretNum,
        collected,
        tenders,
        descriere,
        observatii,
        locatieId: workLocatieId,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inchirieri'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      reset()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const renterValid =
    (renterKind === 'teacher' && Boolean(teacherId)) ||
    (renterKind === 'client' && Boolean(clientId)) ||
    (renterKind === 'guest' && Boolean(guestNume.trim() && guestTel.trim()))
  const canSave =
    Boolean(sala && oraStart && oraFinal) &&
    renterValid &&
    !conflict &&
    (isFreePractice || pret != null)

  return (
    <div className="space-y-4">
      {/* Slot: locație + sală + dată + oră + durată */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Locație" required>
          <Select
            options={locatiiQ.data ?? []}
            value={locatie}
            onChange={(e) => {
              setLocatie(e.target.value)
              setSala('')
            }}
            placeholder="Alege locația…"
          />
        </Field>
        <Field label="Sală" required>
          <Select
            options={saliQ.data ?? []}
            value={sala}
            onChange={(e) => setSala(e.target.value)}
            placeholder={locatie ? 'Alege sala…' : 'Alege întâi locația'}
          />
        </Field>
        <Field label="Data" required>
          <DateInput value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Ora start" required>
          <TextInput
            type="time"
            step={1800}
            value={oraStart}
            onChange={(e) => setOraStart(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Durată">
        <div className="flex flex-wrap items-center gap-1.5">
          {DURATE_RAPIDE.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurataMin(d)}
              className={[
                'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors',
                durataMin === d
                  ? 'border-quasar-yellow bg-quasar-yellow text-ink'
                  : 'border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink',
              ].join(' ')}
            >
              {d} min
            </button>
          ))}
          <Select
            className="w-40"
            options={DURATE_TOATE.map((d) => ({ value: String(d), label: `${d} min` }))}
            value={String(durataMin)}
            onChange={(e) => setDurataMin(Number(e.target.value))}
          />
          {oraFinal && (
            <span className="ml-1 text-sm text-muted">
              → {oraStart}–{oraFinal}
            </span>
          )}
        </div>
      </Field>

      {conflict && (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm font-medium text-danger">
          Interval ocupat — {conflict.kind === 'curs' ? 'curs' : 'închiriere'}:{' '}
          {conflict.label} ({conflict.ora_start}–{conflict.ora_final})
        </p>
      )}

      {/* Chiriaș */}
      <Field label="Cine închiriază">
        <div className="flex flex-wrap gap-1.5">
          {(['teacher', 'client', 'guest'] as RenterKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRenterKind(k)}
              className={[
                'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors',
                renterKind === k
                  ? 'border-quasar-yellow bg-quasar-yellow text-ink'
                  : 'border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink',
              ].join(' ')}
            >
              {RENTER_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>

      {renterKind === 'teacher' && (
        <div className="space-y-3 rounded-md border border-line p-3">
          <Field label="Teacher" required>
            <Combobox
              placeholder="Caută teacher…"
              options={teacheriQ.data ?? []}
              value={teacherId}
              onChange={setTeacherId}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTeacherFree(true)}
              className={[
                'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors',
                teacherFree
                  ? 'border-quasar-yellow bg-quasar-yellow text-ink'
                  : 'border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink',
              ].join(' ')}
            >
              Antrenament individual (gratis)
            </button>
            <button
              type="button"
              onClick={() => setTeacherFree(false)}
              className={[
                'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors',
                !teacherFree
                  ? 'border-quasar-yellow bg-quasar-yellow text-ink'
                  : 'border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink',
              ].join(' ')}
            >
              Închiriere plătită (tarif Staff)
            </button>
          </div>
        </div>
      )}

      {renterKind === 'client' && (
        <Field label="Client" required>
          <Combobox
            placeholder="Caută client (nume sau telefon)…"
            options={clientiQ.data ?? []}
            value={clientId}
            onChange={setClientId}
          />
        </Field>
      )}

      {renterKind === 'guest' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume guest" required>
            <TextInput value={guestNume} onChange={(e) => setGuestNume(e.target.value)} />
          </Field>
          <Field label="Telefon guest" required>
            <TextInput value={guestTel} onChange={(e) => setGuestTel(e.target.value)} />
          </Field>
        </div>
      )}

      {tarifLipsa && (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm font-medium text-danger">
          Tarif nesetat pentru „{salaNume}" ({tierLabel}) — completează-l în Setări.
        </p>
      )}

      {/* Plată */}
      {!isFreePractice && pret != null && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Încasează acum (RON)">
            <TextInput
              type="number"
              min={0}
              max={pretNum || undefined}
              step="0.01"
              value={incasatDefault}
              onChange={(e) => {
                setIncasat(e.target.value)
                setIncasatTouched(true)
              }}
            />
            <p className="mt-1 text-xs text-muted">
              Preț: <strong className="text-ink">{formatRON(pretNum)}</strong>
              {rest > 0 && (
                <>
                  {' '}· rest <strong className="text-ink">{formatRON(rest)}</strong>{' '}
                  {renterKind === 'client'
                    ? '(datorie pe client)'
                    : renterKind === 'teacher'
                      ? '(neachitat — de încasat mai târziu)'
                      : '(trebuie integral)'}
                </>
              )}
            </p>
          </Field>
          {collected > 0 && (
            <MetodaPlataField
              metoda={metoda}
              onMetoda={setMetoda}
              total={collected}
              cash={cash}
              card={card}
              onCash={setCash}
              onCard={setCard}
            />
          )}
        </div>
      )}

      <Field label="Observații (opțional)">
        <TextArea rows={2} value={observatii} onChange={(e) => setObservatii(e.target.value)} />
      </Field>

      {/* Rezumat confirmare */}
      {sala && oraFinal && renterName && (
        <div className="rounded-md border border-quasar-yellow/60 bg-quasar-yellow/10 p-3 text-sm">
          <div className="font-bold text-ink">
            {salaNume} · {data} · {oraStart}–{oraFinal}
          </div>
          <div className="mt-0.5 text-ink">
            {RENTER_LABEL[renterKind]} <strong>{renterName}</strong> — tarif{' '}
            <strong>{tierLabel}</strong> ·{' '}
            <strong>{isFreePractice ? '0 lei (gratis)' : formatRON(pretNum)}</strong>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-quasar-gray-light pt-3">
        <div className="mr-auto flex items-center gap-2 text-xs text-quasar-gray">
          📍 {locatieNume ?? 'fără locație de lucru'}
        </div>
        <Button variant="secondary" onClick={onClose}>
          Anulează
        </Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || !canSave}>
          {submit.isPending
            ? 'Se salvează…'
            : isFreePractice
              ? 'Rezervă (gratis)'
              : rest > 0
                ? renterKind === 'client'
                  ? 'Rezervă + datorie'
                  : 'Rezervă + neachitat'
                : 'Rezervă + încasează'}
        </Button>
      </div>
    </div>
  )
}
