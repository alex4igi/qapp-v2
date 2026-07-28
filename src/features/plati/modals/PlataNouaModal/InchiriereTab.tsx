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
import { useAuth } from '@/hooks/useAuth'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { isPrivileged } from '@/lib/rolesMatrix'
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

const PILL_ON =
  'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors border-quasar-yellow bg-quasar-yellow text-ink'
const PILL_OFF =
  'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink'

export function InchiriereTab({ onClose, defaultInchiriere }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  // Teacher: rezervă doar pentru el, fără încasare (plata se face la recepție).
  // Garanțiile tari sunt în DB (politici RLS + trigger-gard pe inchirieri).
  const teacherMode = role === 'teacher'
  const privileged = isPrivileged(role)
  const { teacherId: ownTeacherId, loading: ownTeacherLoading } = useCurrentTeacherId()
  const {
    locatieId: workLocatieId,
    locatieNume,
    locked: locatieLocked,
  } = useWorkingLocatie()

  // „Rezervi doar la locația ta" rămâne regula recepției (banii intră în casa
  // locației ei). Instructorul își rezervă sala oriunde — locul unde predă n-are
  // legătură cu sala pe care o folosește (oglindit în inchirieri_teacher_insert).
  const locatieFixa = locatieLocked && !teacherMode
  const [locatie, setLocatie] = useState(
    locatieFixa
      ? (workLocatieId ?? '')
      : (defaultInchiriere?.locatie ?? workLocatieId ?? ''),
  )
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

  // Preț manual (proiecte speciale) — doar manager+; ocolește grila de tarife.
  const [pretManualOn, setPretManualOn] = useState(false)
  const [manualPret, setManualPret] = useState('')

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
  // Chiriașul NU se filtrează pe locația de lucru: un instructor care predă la
  // Nicolina poate închiria o sală pe Ștefan cel Mare (și invers) — locul unde
  // predă n-are legătură cu sala pe care o rezervă. Filtrul implicit pe locație
  // îl scotea din listă și îl făcea nerezervabil.
  const teacheriQ = useTeacheriOptions({ locatieId: null })
  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
    enabled: !teacherMode,
  })
  const tarifeQ = useQuery({ queryKey: ['tarife-inchiriere'], queryFn: listTarifeInchiriere })

  const salaNume = useMemo(
    () => saliQ.data?.find((s) => s.value === sala)?.label ?? '',
    [saliQ.data, sala],
  )

  // Teacherul rezervă doar pe propriul profil.
  const effTeacherId = teacherMode ? (ownTeacherId ?? '') : teacherId

  const manualMode = privileged && pretManualOn
  const tier: Enums<'tier_inchiriere'> = manualMode
    ? 'manual'
    : renterKind === 'teacher'
      ? 'staff'
      : 'client'
  const isFreePractice = !manualMode && renterKind === 'teacher' && teacherFree

  const tarif = useMemo<TarifBracket | null>(() => {
    const row = tarifeQ.data?.find((t) => t.sala === sala && t.tier === tier)
    return row ?? null
  }, [tarifeQ.data, sala, tier])

  const manualPretNum =
    manualPret.trim() === '' ? null : Math.max(0, Number(manualPret) || 0)
  const pret = manualMode
    ? manualPretNum
    : isFreePractice
      ? 0
      : computePret(tarif, durataMin)
  const oraFinal = computeOraFinal(oraStart, durataMin)
  const tarifLipsa = !manualMode && !isFreePractice && sala !== '' && pret == null

  // Default „Încasează acum" = prețul, până când recepția îl editează.
  // Teacherul nu încasează niciodată — rezervarea lui rămâne neachitată.
  const pretNum = pret ?? 0
  const incasatDefault = incasatTouched ? incasat : pretNum > 0 ? String(pretNum) : '0'
  const collected = teacherMode
    ? 0
    : Math.min(Math.max(0, Number(incasatDefault) || 0), pretNum)
  const rest = Math.max(0, pretNum - collected)

  // Verificare conflict live (interval overlap cu cursuri + închirieri).
  const conflictQ = useQuery({
    queryKey: ['inchiriere-conflict', sala, data, oraStart, durataMin],
    queryFn: () =>
      checkInchiriereConflict({ sala, data, oraStart, durataMin }),
    enabled: Boolean(sala && data && oraStart && durataMin),
  })
  const conflict = conflictQ.data ?? null

  const tierLabel = manualMode
    ? 'Manual (proiect)'
    : isFreePractice
      ? 'Gratis (antrenament)'
      : tier === 'staff'
        ? 'Staff'
        : 'Client'
  const renterName = useMemo(() => {
    if (renterKind === 'teacher')
      return teacheriQ.data?.find((t) => t.value === effTeacherId)?.label ?? ''
    if (renterKind === 'client') return clientiQ.data?.find((c) => c.value === clientId)?.label ?? ''
    return guestNume.trim()
  }, [renterKind, effTeacherId, clientId, guestNume, teacheriQ.data, clientiQ.data])

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
    setPretManualOn(false)
    setManualPret('')
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
        if (!effTeacherId) {
          throw new Error(
            teacherMode
              ? 'Contul tău nu e legat de un profil de instructor — cere unui manager să facă legătura din fișa ta.'
              : 'Alege teacherul.',
          )
        }
        renter = {
          kind: 'teacher',
          teacherId: effTeacherId,
          freePractice: isFreePractice,
        }
      } else if (renterKind === 'client') {
        if (!clientId) throw new Error('Alege clientul.')
        renter = { kind: 'client', clientId }
      } else {
        if (!guestNume.trim() || !guestTel.trim())
          throw new Error('Pentru guest, completează nume și telefon.')
        renter = { kind: 'guest', nume: guestNume, tel: guestTel }
      }

      if (manualMode && pret == null) {
        throw new Error('Introdu prețul manual (RON).')
      }
      if (!manualMode && !isFreePractice && pret == null) {
        throw new Error('Tarif nesetat pentru această sală — completează-l în Setări.')
      }
      // Guest (walk-in fără cont) achită integral pe loc; doar teacher/client pot amâna.
      if (rest > 0 && renterKind === 'guest') {
        throw new Error('Guest trebuie să achite integral pe loc.')
      }
      // Locația de lucru e casa în care intră banii — obligatorie doar când
      // chiar se mișcă bani. O rezervare fără bani (antrenamentul unui
      // instructor) n-are nevoie de ea.
      const miscaBani = collected > 0 || (renterKind === 'client' && rest > 0)
      if (miscaBani && !workLocatieId) {
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
        locatieId: workLocatieId ?? locatie,
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
    (renterKind === 'teacher' && Boolean(effTeacherId)) ||
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
            disabled={locatieFixa}
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
              className={durataMin === d ? PILL_ON : PILL_OFF}
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
      {teacherMode ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          <div className="text-sm text-ink">
            Rezervi pentru tine:{' '}
            <strong>
              {renterName ||
                (ownTeacherLoading
                  ? 'se încarcă…'
                  : ownTeacherId
                    ? 'profilul tău'
                    : 'contul nu e legat de un profil de instructor')}
            </strong>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTeacherFree(true)}
              className={teacherFree ? PILL_ON : PILL_OFF}
            >
              Antrenament individual (gratis)
            </button>
            <button
              type="button"
              onClick={() => setTeacherFree(false)}
              className={!teacherFree ? PILL_ON : PILL_OFF}
            >
              Închiriere plătită (tarif Staff)
            </button>
          </div>
          {!teacherFree && (
            <p className="text-xs text-muted">
              Plata se înregistrează la recepție — rezervarea rămâne „neachitat" până
              atunci.
            </p>
          )}
        </div>
      ) : (
        <>
          <Field label="Cine închiriază">
            <div className="flex flex-wrap gap-1.5">
              {(['teacher', 'client', 'guest'] as RenterKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRenterKind(k)}
                  className={renterKind === k ? PILL_ON : PILL_OFF}
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
              {!manualMode && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTeacherFree(true)}
                    className={teacherFree ? PILL_ON : PILL_OFF}
                  >
                    Antrenament individual (gratis)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherFree(false)}
                    className={!teacherFree ? PILL_ON : PILL_OFF}
                  >
                    Închiriere plătită (tarif Staff)
                  </button>
                </div>
              )}
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
        </>
      )}

      {/* Preț manual (proiecte) — doar manager+ */}
      {privileged && (
        <Field label="Tarif">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPretManualOn(false)}
              className={!pretManualOn ? PILL_ON : PILL_OFF}
            >
              Din grilă
            </button>
            <button
              type="button"
              onClick={() => setPretManualOn(true)}
              className={pretManualOn ? PILL_ON : PILL_OFF}
            >
              Preț manual (proiect)
            </button>
            {manualMode && (
              <TextInput
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                placeholder="RON"
                value={manualPret}
                onChange={(e) => setManualPret(e.target.value)}
              />
            )}
          </div>
        </Field>
      )}

      {tarifLipsa && (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm font-medium text-danger">
          Tarif nesetat pentru „{salaNume}" ({tierLabel}) — completează-l în Setări.
        </p>
      )}

      {/* Plată — teacherul nu încasează (plata se face la recepție) */}
      {!teacherMode && !isFreePractice && pret != null && (
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
              : teacherMode
                ? 'Rezervă — plata la recepție'
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
