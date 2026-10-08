import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, TextInput, Select, Button, DateInput } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getMotiveAbandon, marcheazaContact } from './api'
import type { CanalContact, CazAbsenta, RezultatContact } from './types'

export type CerereReziliere = { caz: CazAbsenta; motiv: string; reintegrare: boolean }

type Props = {
  open: boolean
  caz: CazAbsenta | null
  onClose: () => void
  /** Renunță / Amână eliberează locul: după salvare se deschide rezilierea. */
  onCereReziliere: (c: CerereReziliere) => void
}

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'dm', label: 'WhatsApp / DM', icon: '📩' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
]

const REZULTATE: { value: RezultatContact; label: string; cls: string }[] = [
  { value: 'reusit', label: 'Revine la curs', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'nu_raspunde', label: 'Nu răspunde', cls: 'border-slate-300 bg-slate-50 text-slate-700' },
  { value: 'follow_up', label: 'Amână', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
  { value: 'pierdut', label: 'Renunță', cls: 'border-red-300 bg-red-50 text-red-700' },
]

function aziBucuresti(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
}

function plusZile(iso: string, zile: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + zile)
  return d.toISOString().slice(0, 10)
}

function ziRo(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// Ce urmează după salvare, spus înainte de salvare — recepția nu trebuie să ghicească.
function ceUrmeaza(caz: CazAbsenta, rezultat: RezultatContact, dataRevenire: string): string {
  const azi = aziBucuresti()
  switch (rezultat) {
    case 'reusit':
      return 'Când vine la curs, cazul se închide singur.'
    case 'nu_raspunde': {
      if (caz.stare === 'fara_raspuns' || caz.stare === 'de_confirmat') {
        return 'Apelul se notează; cazul rămâne unde e.'
      }
      if (caz.incercari >= 1) {
        const weekend = [0, 6].includes(new Date(`${azi}T12:00:00`).getDay())
        return `Al doilea apel fără răspuns: ${weekend ? 'luni' : 'azi'} la 16:00 pleacă SMS-ul (a treia încercare), iar cazul trece în „Fără răspuns". La 45 de zile fără prezență, managerul decide rezilierea.`
      }
      return `Cazul revine în „De sunat azi" ${ziRo(plusZile(azi, 7))}. Atunci sună-l la altă oră.`
    }
    case 'follow_up':
      return dataRevenire
        ? `După salvare se deschide rezilierea: locul din grupă se eliberează. Cazul revine în listă ${ziRo(dataRevenire)} — atunci suni familia și discuți cu managerul opțiunile.`
        : 'Alege data la care familia vrea să revină.'
    case 'pierdut':
      return 'După salvare se deschide rezilierea, cu motivul completat. Cazul rămâne la K3 (decizia s-a luat în contact).'
  }
}

export function ContactAbsentaModal({ open, caz, onClose, onCereReziliere }: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [rezultat, setRezultat] = useState<RezultatContact | null>(null)
  const [motivId, setMotivId] = useState('')
  const [motivLiber, setMotivLiber] = useState('')
  const [pasUrmator, setPasUrmator] = useState('')
  const [observatii, setObservatii] = useState('')
  const [dataRevenire, setDataRevenire] = useState('')
  const [error, setError] = useState<string | null>(null)

  const motive = useQuery({
    queryKey: ['motive-abandon'],
    queryFn: getMotiveAbandon,
    staleTime: 30 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setRezultat(null)
    setMotivId('')
    setMotivLiber('')
    setPasUrmator('')
    setObservatii('')
    setDataRevenire('')
    setError(null)
  }, [open])

  const faraRaspuns = rezultat === 'nu_raspunde'
  const azi = aziBucuresti()

  const save = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: () =>
      marcheazaContact({
        absentaId: caz!.id,
        canal: faraRaspuns ? 'telefon' : canal,
        rezultat: rezultat!,
        motivId: faraRaspuns ? null : motivId || null,
        motivLiber: faraRaspuns ? null : motivLiber || null,
        pasUrmator: pasUrmator || null,
        observatii: observatii || null,
        dataRevenire: rezultat === 'follow_up' ? dataRevenire : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absente-21z'] })
      void queryClient.invalidateQueries({ queryKey: ['ansamblu', 'absente-21z'] })
      const c = caz!
      const eticheta = motive.data?.find((m) => m.id === motivId)?.eticheta ?? ''
      const detaliu = [eticheta, motivLiber.trim()].filter(Boolean).join(': ')
      onClose()
      if (rezultat === 'pierdut') {
        onCereReziliere({ caz: c, motiv: detaliu, reintegrare: true })
      } else if (rezultat === 'follow_up') {
        onCereReziliere({
          caz: c,
          motiv: [`Amânare — revine pe ${dataRevenire.split('-').reverse().join('.')}`, detaliu]
            .filter(Boolean)
            .join('. '),
          reintegrare: false,
        })
      }
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvarea contactului.')),
  })

  if (!caz) return null

  const lipsa =
    !rezultat ||
    (!faraRaspuns && !motivId) ||
    (rezultat === 'follow_up' && (!dataRevenire || dataRevenire <= azi))

  return (
    <Modal
      open={open}
      title={`Contact recuperare — ${caz.client_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || lipsa}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md bg-quasar-gray-light px-3 py-2 text-sm">
          {caz.curs_nume}
          {caz.locatie_nume && <span className="text-quasar-gray"> · {caz.locatie_nume}</span>}
          <div className="mt-0.5 text-quasar-gray">
            {caz.zile_tacere} zile fără prezență
            {caz.ultima_prezenta
              ? ` · ultima dată pe ${caz.ultima_prezenta}`
              : ' · nu a venit niciodată'}
            {caz.telefon && ` · ${caz.telefon}`}
          </div>
          {caz.incercari > 0 && (
            <div className="mt-0.5 text-quasar-gray">
              {caz.incercari === 1 ? 'Un apel fără răspuns până acum.' : `${caz.incercari} apeluri fără răspuns până acum.`}
            </div>
          )}
        </div>

        <Field label="Rezultat">
          <div className="flex flex-wrap gap-2">
            {REZULTATE.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRezultat(r.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  rezultat === r.value
                    ? `${r.cls} font-medium`
                    : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {rezultat && (
            <p className="mt-2 rounded-md border border-line bg-quasar-gray-light/60 px-3 py-2 text-xs text-quasar-black">
              {ceUrmeaza(caz, rezultat, dataRevenire)}
            </p>
          )}
        </Field>

        {rezultat === 'follow_up' && (
          <Field label="Revine pe" htmlFor="ca-revenire">
            <DateInput
              id="ca-revenire"
              value={dataRevenire}
              min={plusZile(azi, 1)}
              onChange={(e) => setDataRevenire(e.target.value)}
            />
          </Field>
        )}

        {!faraRaspuns && rezultat && (
          <>
            <Field label="Canal">
              <div className="flex flex-wrap gap-2">
                {CANALE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCanal(c.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      canal === c.value
                        ? 'border-quasar-yellow bg-quasar-yellow/10 font-medium text-quasar-black'
                        : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
                    }`}
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Motivul declarat de familie" htmlFor="ca-motiv">
              <Select
                id="ca-motiv"
                value={motivId}
                onChange={(e) => setMotivId(e.target.value)}
                options={[
                  { value: '', label: motive.isLoading ? 'Se încarcă…' : '— alege motivul —' },
                  ...(motive.data ?? []).map((m) => ({ value: m.id, label: m.eticheta })),
                ]}
              />
              <p className="mt-1 text-xs text-quasar-gray">
                Obligatoriu. După un sezon, lista asta arată de ce pleacă oamenii de la Quasar —
                e singurul loc unde se adună informația.
              </p>
            </Field>

            <Field label="Detalii despre motiv (opțional)" htmlFor="ca-motiv-liber">
              <TextInput
                id="ca-motiv-liber"
                value={motivLiber}
                onChange={(e) => setMotivLiber(e.target.value)}
                placeholder="ex: s-a suprapus cu meditațiile la mate"
              />
            </Field>

            {rezultat === 'reusit' && (
              <Field label="Pas următor" htmlFor="ca-pas">
                <TextInput
                  id="ca-pas"
                  value={pasUrmator}
                  onChange={(e) => setPasUrmator(e.target.value)}
                  placeholder="ex: revine luni la 17:30"
                />
              </Field>
            )}
          </>
        )}

        {rezultat && (
          <Field label="Observații" htmlFor="ca-obs">
            <TextArea
              id="ca-obs"
              value={observatii}
              onChange={(e) => setObservatii(e.target.value)}
              placeholder={faraRaspuns ? 'opțional — ex: a intrat căsuța vocală' : 'ce ați discutat'}
            />
          </Field>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
