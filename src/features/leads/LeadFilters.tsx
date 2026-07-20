import {
  TextInput,
  Select,
  Button,
  DateInput,
  CheckboxGroup,
  type SelectOption,
} from '@/components/ui'
import { matchesWords } from '@/lib/search'
import type { Lead, StatusLead } from '@/types/db'
import {
  GRUPE,
  GRUPA_LABELS,
  LOCATII,
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

// Statusurile care chiar așteaptă un telefon — presetul vederii Listă.
export const STATUSURI_DE_SUNAT: StatusLead[] = [
  'nou', 'contactat', 'nu_a_venit', 'a_venit',
]

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

// Predicat UNIC, folosit de Kanban, Listă și Nurture. Toate cheile se aplică în
// toate vederile — doar controalele randate diferă (`variant`). Altfel comutarea
// Kanban ⇄ Listă ar schimba tăcut setul de rânduri, exact invariantul pe care se
// sprijină „sunt sigur că n-am ratat pe nimeni".
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

export function hasActiveFilters(v: LeadFiltersValue): boolean {
  return Boolean(
    v.search || v.sursa || v.grupa || v.locatie ||
    v.statusuri.length || v.contact || v.perioada.preset !== 'tot',
  )
}

type Props = {
  value: LeadFiltersValue
  campanii: SelectOption[]
  onChange: (next: LeadFiltersValue) => void
  variant?: 'kanban' | 'lista' | 'nurture'
}

export function LeadFilters({
  value,
  campanii,
  onChange,
  variant = 'kanban',
}: Props) {
  const set = <K extends keyof LeadFiltersValue>(
    key: K,
    v: LeadFiltersValue[K],
  ) => onChange({ ...value, [key]: v })

  // Statusul e redundant în Kanban (coloana E statusul) și uniform în Nurture.
  const showStatus = variant === 'lista'
  const showListFilters = variant === 'lista' || variant === 'nurture'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-52">
          <TextInput
            placeholder="Caută nume, telefon…"
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            placeholder="Toate sursele"
            options={campanii}
            value={value.sursa}
            onChange={(e) => set('sursa', e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            placeholder="Toate grupele"
            options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
            value={value.grupa}
            onChange={(e) => set('grupa', e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            placeholder="Toate locațiile"
            options={LOCATIE_OPTIONS}
            value={value.locatie}
            onChange={(e) => set('locatie', e.target.value)}
          />
        </div>
        {showListFilters && (
          <>
            <div className="w-48">
              <Select
                placeholder="Orice contact"
                options={CONTACT_OPTIONS}
                value={value.contact}
                onChange={(e) =>
                  set('contact', e.target.value as ContactFilter)
                }
              />
            </div>
            <div className="w-44">
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
            </div>
            {value.perioada.preset === 'personalizat' && (
              <>
                <div className="w-36">
                  <DateInput
                    value={value.perioada.de ?? ''}
                    onChange={(e) =>
                      set('perioada', { ...value.perioada, de: e.target.value })
                    }
                  />
                </div>
                <span className="text-sm text-quasar-gray">→</span>
                <div className="w-36">
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
              </>
            )}
          </>
        )}
        {hasActiveFilters(value) && (
          <Button variant="secondary" onClick={() => onChange(EMPTY_LEAD_FILTERS)}>
            Resetează
          </Button>
        )}
      </div>

      {showStatus && (
        <CheckboxGroup
          options={ALL_STATUS_COLUMNS.map((c) => ({
            label: c.label,
            value: c.status,
          }))}
          value={value.statusuri}
          onChange={(v) => set('statusuri', v)}
        />
      )}

      {/* Filtrare invizibilă e mai rea decât lipsa filtrului: dacă vii din Listă
          cu statusuri bifate, Kanbanul o spune explicit. */}
      {!showStatus && value.statusuri.length > 0 && (
        <button
          type="button"
          onClick={() => set('statusuri', [])}
          className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800 hover:bg-amber-200"
        >
          {value.statusuri.length} statusuri filtrate ✕
        </button>
      )}
    </div>
  )
}
