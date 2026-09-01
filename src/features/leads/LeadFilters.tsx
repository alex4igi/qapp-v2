import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  TextInput,
  Select,
  Button,
  DateInput,
  CheckboxGroup,
  Field,
  type SelectOption,
} from '@/components/ui'
import { matchesWords } from '@/lib/search'
import type { Lead, StatusLead } from '@/types/db'
import {
  GRUPE,
  GRUPA_LABELS,
  LOCATII,
  PIPELINE_COLUMNS,
  ALL_STATUS_COLUMNS,
  DAY_MS,
  PERIOADA_LABELS,
  esteExClient,
  perioadaToRange,
  type Perioada,
  type PerioadaPreset,
} from './constants'
import { ultimContactMeta } from './leadColumns'

export type ContactFilter = '' | 'niciodata' | 'peste7' | 'peste30' | 'azi'

// Nurture amestecă două populații care nu se lucrează la fel: lead-uri care n-au
// fost niciodată clienți și umbre de ex-client (rând generat de cronul de 02:00
// pentru pool-ul de reactivare). Umbra are `created` = data rulării cronului,
// deci în lista sortată pe „Adăugat" stă în vârf și arată exact ca un lead
// proaspăt. `id_client` e linia care le desparte.
export type TipLead = '' | 'lead' | 'exclient'

export type LeadFiltersValue = {
  search: string
  sursa: string
  grupa: string
  locatie: string
  statusuri: string[] // [] = toate
  contact: ContactFilter
  perioada: Perioada
  tip: TipLead
}

export const EMPTY_LEAD_FILTERS: LeadFiltersValue = {
  search: '',
  sursa: '',
  grupa: '',
  locatie: '',
  statusuri: [],
  contact: '',
  perioada: { preset: 'tot' },
  tip: '',
}

// Statusurile care chiar așteaptă un telefon — presetul implicit al vederii Listă.
export const STATUSURI_DE_SUNAT: StatusLead[] = [
  'nou', 'contactat', 'nu_a_venit', 'a_venit',
]

const TOT_PIPELINE = PIPELINE_COLUMNS.map((c) => c.status)
const CU_NURTURE = ALL_STATUS_COLUMNS.map((c) => c.status)
const DOAR_NURTURE = ['nurture']

// Presetările înlocuiesc rândul de 9 chips: owner-ul gândește în „pe cine sun",
// nu în combinații de statusuri. „Personalizat" descoperă chips-urile la nevoie.
export type StatusPreset =
  | 'de_sunat'
  | 'pipeline'
  | 'nurture'
  | 'cu_nurture'
  | 'custom'

// `nurture` = DOAR pool-ul de reactivare. A însemnat cândva „pipeline + nurture",
// iar tabul „♻️ Nurture" arăta toate cele 9 statusuri: în lista promisă ca Nurture
// apăreau lead-uri Programat / Nou și părea că un lead poate fi în două locuri
// deodată. `status` e un singur câmp — vederea combinată își are acum presetul ei.
const STATUS_PRESETS: { value: StatusPreset; label: string; set: string[] }[] = [
  { value: 'de_sunat', label: 'De sunat', set: STATUSURI_DE_SUNAT },
  { value: 'pipeline', label: 'Tot pipeline-ul', set: TOT_PIPELINE },
  { value: 'nurture', label: 'Doar Nurture', set: DOAR_NURTURE },
  { value: 'cu_nurture', label: 'Pipeline + Nurture', set: CU_NURTURE },
]

export function statusSetForPreset(p: string | null): string[] {
  // Fără parametru în URL = presetul implicit al vederii Listă: tot pipeline-ul,
  // ca lead-urile să nu dispară tăcut până nu alege omul manual „De sunat".
  return (
    STATUS_PRESETS.find((x) => x.value === p)?.set ?? TOT_PIPELINE
  ).slice()
}

export function presetOf(statusuri: string[]): StatusPreset {
  const eq = (a: string[]) =>
    a.length === statusuri.length && a.every((s) => statusuri.includes(s))
  for (const p of STATUS_PRESETS) if (eq(p.set)) return p.value
  return 'custom'
}

const CONTACT_OPTIONS: SelectOption[] = [
  { label: 'Niciodată contactat', value: 'niciodata' },
  { label: 'Fără contact >7 zile', value: 'peste7' },
  { label: 'Fără contact >30 zile', value: 'peste30' },
  { label: 'Contactat azi', value: 'azi' },
]

// Lead-uri fără locație completată — `leads.locatia` e text liber, nu FK, deci
// valorile scrise altfel („Stefan cel Mare") nu se potrivesc pe LOCATII și ar
// dispărea tăcut la filtrare. Opțiunea explicită le face vizibile.
export const FARA_LOCATIE = '__fara__'

const LOCATIE_OPTIONS: SelectOption[] = [
  ...LOCATII.map((l) => ({ label: l, value: l })),
  { label: '— Fără locație —', value: FARA_LOCATIE },
]

// Predicat UNIC, folosit de Kanban și de Listă. Toate cheile se aplică în ambele
// vederi — doar controalele randate diferă. Altfel comutarea Kanban ⇄ Listă ar
// schimba tăcut setul de rânduri, exact invariantul pe care se sprijină
// „sunt sigur că n-am ratat pe nimeni".
export function applyLeadFilters(
  leads: Lead[],
  f: LeadFiltersValue,
  now = Date.now(),
): Lead[] {
  const range = perioadaToRange(f.perioada)
  const deTs = range.de ? new Date(range.de).getTime() : null
  const panaTs = range.pana ? new Date(range.pana).getTime() : null

  return leads.filter((lead) => {
    if (f.search) {
      const hay = [
        lead.prenume, lead.nume, lead.nume_parinte, lead.telefon, lead.email,
      ].filter(Boolean).join(' ')
      if (!matchesWords(hay, f.search)) return false
    }
    if (f.sursa && lead.sursa !== f.sursa) return false
    if (f.grupa && lead.grupa_varsta !== f.grupa) return false
    if (f.locatie) {
      if (f.locatie === FARA_LOCATIE) {
        if (lead.locatia) return false
      } else if (lead.locatia !== f.locatie) return false
    }
    if (f.statusuri.length && !f.statusuri.includes(lead.status)) return false
    if (f.tip === 'lead' && esteExClient(lead)) return false
    if (f.tip === 'exclient' && !esteExClient(lead)) return false

    if (f.contact) {
      const m = ultimContactMeta(lead, now)
      if (f.contact === 'niciodata' && m.ts !== 0) return false
      // Necontactații intră mereu în „fără contact de peste N zile" — sunt cazul
      // extrem, nu o excepție.
      if (f.contact === 'peste7' && m.ts !== 0 && m.ts > now - 7 * DAY_MS)
        return false
      if (f.contact === 'peste30' && m.ts !== 0 && m.ts > now - 30 * DAY_MS)
        return false
      if (f.contact === 'azi') {
        if (m.ts === 0) return false
        const start = new Date(now)
        start.setHours(0, 0, 0, 0)
        if (m.ts < start.getTime()) return false
      }
    }

    if (deTs != null || panaTs != null) {
      const c = new Date(lead.created).getTime()
      if (deTs != null && c < deTs) return false
      if (panaTs != null && c > panaTs) return false
    }
    return true
  })
}

// Câte filtre „ascunse" sunt active — badge-ul de pe butonul ⚙ Filtre. `search`
// și presetul de status au controale proprii, vizibile, deci nu se numără. La
// fel locația, când e randată ca pill-uri.
function countHiddenFilters(v: LeadFiltersValue, locatiePills: boolean): number {
  let n = 0
  if (v.sursa) n++
  if (v.grupa) n++
  if (v.locatie && !locatiePills) n++
  if (v.contact) n++
  if (v.perioada.preset !== 'tot') n++
  return n
}

// Nurture e în joc? Doar atunci separarea lead / ex-client spune ceva: în restul
// pipeline-ului aproape nimeni n-are `id_client`.
export function nurtureInScope(statusuri: string[]): boolean {
  return statusuri.length === 0 || statusuri.includes('nurture')
}

type TipPill = { value: TipLead; label: string; count: number }

// Contoarele se calculează pe setul cu toate CELELALTE filtre aplicate, ca
// numărul de pe pill să fie exact ce rămâne după click.
function useTipPills(
  leads: Lead[] | undefined,
  value: LeadFiltersValue,
  enabled: boolean,
): TipPill[] {
  return useMemo(() => {
    if (!enabled) return []
    const base = applyLeadFilters(leads ?? [], { ...value, tip: '' })
    const exclienti = base.filter(esteExClient).length
    return [
      { value: '', label: 'Toate', count: base.length },
      { value: 'lead', label: 'Lead-uri', count: base.length - exclienti },
      { value: 'exclient', label: 'Ex-clienți', count: exclienti },
    ]
  }, [leads, value, enabled])
}

type LocatiePill = { value: string; label: string; count: number }

// Cheia de grupare TREBUIE să urmeze exact predicatul din applyLeadFilters
// (truthiness pe `locatia`, egalitate strictă altfel) — altfel contorul de pe
// pill ar promite alt număr de carduri decât apare după click.
function locatieKey(lead: Lead): string {
  return lead.locatia ? lead.locatia : FARA_LOCATIE
}

// Pill-urile arată câte carduri rămân după click, deci se numără pe setul cu
// toate CELELALTE filtre aplicate — nu pe cel deja restrâns la o locație.
function useLocatiePills(
  leads: Lead[] | undefined,
  value: LeadFiltersValue,
  enabled: boolean,
): LocatiePill[] {
  return useMemo(() => {
    if (!enabled) return []
    const base = applyLeadFilters(leads ?? [], { ...value, locatie: '' })
    const counts = new Map<string, number>()
    for (const lead of base) {
      const k = locatieKey(lead)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    // Locațiile canonice apar mereu (chiar și cu 0), ca rândul să nu-și schimbe
    // forma la fiecare filtrare. `leads.locatia` e text liber, deci valorile
    // scrise altfel („Stefan cel Mare") se adaugă doar dacă chiar există —
    // fără ele lead-urile respective n-ar fi accesibile din niciun pill.
    const canonice: string[] = [...LOCATII]
    const scrise = [...counts.keys()]
      .filter((k) => k !== FARA_LOCATIE && !canonice.includes(k))
      .sort((a, b) => a.localeCompare(b, 'ro'))
    return [
      { value: '', label: 'Toate', count: base.length },
      ...[...canonice, ...scrise].map((l) => ({
        value: l,
        label: l,
        count: counts.get(l) ?? 0,
      })),
      {
        value: FARA_LOCATIE,
        label: 'Fără locație',
        count: counts.get(FARA_LOCATIE) ?? 0,
      },
    ]
  }, [leads, value, enabled])
}

type Props = {
  value: LeadFiltersValue
  campanii: SelectOption[]
  onChange: (next: LeadFiltersValue) => void
  // Presetul de status trăiește în URL (tabul „Nurture" e o scurtătură către el),
  // deci schimbarea lui se raportează în sus, nu se scrie direct în `statusuri`.
  onPresetChange?: (preset: StatusPreset) => void
  variant?: 'kanban' | 'lista'
  // Setul pe care se calculează contoarele pill-urilor de locație (Kanban).
  leads?: Lead[]
  // Conținut aliniat la dreapta pe ACELAȘI rând (contoare, export) — ca vederea
  // Listă să pornească cu o singură bară, nu cu trei.
  trailing?: ReactNode
}

export function LeadFilters({
  value,
  campanii,
  onChange,
  onPresetChange,
  variant = 'kanban',
  leads,
  trailing,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const set = <K extends keyof LeadFiltersValue>(
    key: K,
    v: LeadFiltersValue[K],
  ) => onChange({ ...value, [key]: v })

  const isLista = variant === 'lista'
  const preset = presetOf(value.statusuri)
  // În Listă bara are deja preset + contoare; locația rămâne acolo în ⚙ Filtre.
  const locatiePills = useLocatiePills(leads, value, !isLista)
  const tipPills = useTipPills(leads, value, isLista && nurtureInScope(value.statusuri))
  const hidden = countHiddenFilters(value, locatiePills.length > 0)

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="w-56">
        <TextInput
          placeholder="Caută nume, telefon…"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      {isLista && (
        <div className="w-44">
          <Select
            options={[
              ...STATUS_PRESETS.map((p) => ({ label: p.label, value: p.value })),
              ...(preset === 'custom'
                ? [{ label: `Personalizat (${value.statusuri.length})`, value: 'custom' }]
                : []),
            ]}
            value={preset}
            onChange={(e) => {
              const p = e.target.value as StatusPreset
              if (onPresetChange) onPresetChange(p)
              else set('statusuri', statusSetForPreset(p))
            }}
          />
        </div>
      )}

      {tipPills.length > 0 && (
        <div
          role="group"
          aria-label="Filtru tip"
          className="flex items-center gap-1.5"
        >
          {tipPills.map((t) => {
            const activ = value.tip === t.value
            return (
              <button
                key={t.value || 'toate'}
                type="button"
                aria-pressed={activ}
                onClick={() => set('tip', activ && t.value ? '' : t.value)}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  activ
                    ? 'border-quasar-yellow bg-quasar-yellow font-medium text-quasar-black'
                    : 'border-line text-quasar-gray hover:border-quasar-yellow',
                ].join(' ')}
              >
                {t.label}
                <span
                  className={`ml-1.5 text-xs ${
                    activ ? 'text-quasar-black/60' : 'text-quasar-gray/60'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`rounded-[10px] border px-3 py-2 text-sm transition-colors ${
            hidden > 0
              ? 'border-quasar-yellow bg-quasar-yellow/10 text-quasar-black'
              : 'border-line text-quasar-gray hover:border-quasar-yellow'
          }`}
        >
          ⚙ Filtre
          {hidden > 0 && (
            <span className="ml-1.5 rounded-full bg-quasar-yellow px-1.5 text-xs font-semibold text-quasar-black">
              {hidden}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-80 space-y-3 rounded-xl border border-line bg-card p-3 shadow-lg">
            <Field label="Sursă">
              <Select
                placeholder="Toate sursele"
                options={campanii}
                value={value.sursa}
                onChange={(e) => set('sursa', e.target.value)}
              />
            </Field>
            <Field label="Grupă de vârstă">
              <Select
                placeholder="Toate grupele"
                options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
                value={value.grupa}
                onChange={(e) => set('grupa', e.target.value)}
              />
            </Field>
            {locatiePills.length === 0 && (
              <Field label="Locație">
                <Select
                  placeholder="Toate locațiile"
                  options={LOCATIE_OPTIONS}
                  value={value.locatie}
                  onChange={(e) => set('locatie', e.target.value)}
                />
              </Field>
            )}

            {isLista && (
              <>
                <Field label="Ultim contact">
                  <Select
                    placeholder="Orice contact"
                    options={CONTACT_OPTIONS}
                    value={value.contact}
                    onChange={(e) =>
                      set('contact', e.target.value as ContactFilter)
                    }
                  />
                </Field>
                <Field label="Adăugat în perioada">
                  <Select
                    options={(
                      Object.keys(PERIOADA_LABELS) as PerioadaPreset[]
                    ).map((p) => ({ label: PERIOADA_LABELS[p], value: p }))}
                    value={value.perioada.preset}
                    onChange={(e) =>
                      set('perioada', {
                        ...value.perioada,
                        preset: e.target.value as PerioadaPreset,
                      })
                    }
                  />
                </Field>
                {value.perioada.preset === 'personalizat' && (
                  <div className="flex items-center gap-2">
                    <DateInput
                      value={value.perioada.de ?? ''}
                      onChange={(e) =>
                        set('perioada', { ...value.perioada, de: e.target.value })
                      }
                    />
                    <span className="text-sm text-quasar-gray">→</span>
                    <DateInput
                      value={value.perioada.pana ?? ''}
                      onChange={(e) =>
                        set('perioada', {
                          ...value.perioada,
                          pana: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
                <Field label="Statusuri">
                  <CheckboxGroup
                    options={ALL_STATUS_COLUMNS.map((c) => ({
                      label: c.label,
                      value: c.status,
                    }))}
                    value={value.statusuri}
                    onChange={(v) => set('statusuri', v)}
                  />
                </Field>
              </>
            )}

            <div className="flex justify-end pt-1">
              <Button
                variant="secondary"
                onClick={() =>
                  onChange({
                    ...EMPTY_LEAD_FILTERS,
                    search: value.search,
                    statusuri: value.statusuri,
                  })
                }
              >
                Golește filtrele
              </Button>
            </div>
          </div>
        )}
      </div>

      {locatiePills.length > 0 && (
        <>
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
          <div
            role="group"
            aria-label="Filtru locație"
            className="flex flex-wrap items-center gap-1.5"
          >
            {locatiePills.map((p) => {
              const activ = value.locatie === p.value
              return (
                <button
                  key={p.value || 'toate'}
                  type="button"
                  aria-pressed={activ}
                  // Re-click pe pill-ul activ = înapoi la „Toate": altfel golirea
                  // filtrului ar cere un al doilea target de click.
                  onClick={() => set('locatie', activ && p.value ? '' : p.value)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    activ
                      ? 'border-quasar-yellow bg-quasar-yellow font-medium text-quasar-black'
                      : 'border-line text-quasar-gray hover:border-quasar-yellow',
                  ].join(' ')}
                >
                  {p.label}
                  <span
                    className={`ml-1.5 text-xs ${
                      activ ? 'text-quasar-black/60' : 'text-quasar-gray/60'
                    }`}
                  >
                    {p.count}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}
