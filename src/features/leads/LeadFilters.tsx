import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  perioadaToRange,
  type Perioada,
  type PerioadaPreset,
} from './constants'
import { ultimContactMeta } from './leadColumns'

export type ContactFilter = '' | 'niciodata' | 'peste7' | 'peste30' | 'azi'

export type LeadFiltersValue = {
  search: string
  sursa: string
  grupa: string
  locatie: string
  statusuri: string[] // [] = toate
  contact: ContactFilter
  perioada: Perioada
}

export const EMPTY_LEAD_FILTERS: LeadFiltersValue = {
  search: '',
  sursa: '',
  grupa: '',
  locatie: '',
  statusuri: [],
  contact: '',
  perioada: { preset: 'tot' },
}

// Statusurile care chiar așteaptă un telefon — presetul implicit al vederii Listă.
export const STATUSURI_DE_SUNAT: StatusLead[] = [
  'nou', 'contactat', 'nu_a_venit', 'a_venit',
]

const TOT_PIPELINE = PIPELINE_COLUMNS.map((c) => c.status)
const CU_NURTURE = ALL_STATUS_COLUMNS.map((c) => c.status)

// Presetările înlocuiesc rândul de 9 chips: owner-ul gândește în „pe cine sun",
// nu în combinații de statusuri. „Personalizat" descoperă chips-urile la nevoie.
export type StatusPreset = 'de_sunat' | 'pipeline' | 'nurture' | 'custom'

const STATUS_PRESETS: { value: StatusPreset; label: string; set: string[] }[] = [
  { value: 'de_sunat', label: 'De sunat', set: STATUSURI_DE_SUNAT },
  { value: 'pipeline', label: 'Tot pipeline-ul', set: TOT_PIPELINE },
  { value: 'nurture', label: 'Cu Nurture', set: CU_NURTURE },
]

export function statusSetForPreset(p: string | null): string[] {
  return (
    STATUS_PRESETS.find((x) => x.value === p)?.set ?? STATUSURI_DE_SUNAT
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
// și presetul de status au controale proprii, vizibile, deci nu se numără.
function countHiddenFilters(v: LeadFiltersValue): number {
  let n = 0
  if (v.sursa) n++
  if (v.grupa) n++
  if (v.locatie) n++
  if (v.contact) n++
  if (v.perioada.preset !== 'tot') n++
  return n
}

type Props = {
  value: LeadFiltersValue
  campanii: SelectOption[]
  onChange: (next: LeadFiltersValue) => void
  // Presetul de status trăiește în URL (tabul „Nurture" e o scurtătură către el),
  // deci schimbarea lui se raportează în sus, nu se scrie direct în `statusuri`.
  onPresetChange?: (preset: StatusPreset) => void
  variant?: 'kanban' | 'lista'
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
  const hidden = countHiddenFilters(value)

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
            <Field label="Locație">
              <Select
                placeholder="Toate locațiile"
                options={LOCATIE_OPTIONS}
                value={value.locatie}
                onChange={(e) => set('locatie', e.target.value)}
              />
            </Field>

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

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}
