import type { Lead, StatusLead, GrupaLead } from '@/types/db'

export type PipelineColumn = {
  status: StatusLead
  label: string
  text: string
  bg: string
  border: string
  // Stilul Quasar OS: header de coloană solid colorat cu text alb (vezi KanbanColumn).
  // `bg`/`text`/`border` rămân variantele pale, folosite de StatusBadge.
  header: string
}

// Coloanele board-ului Kanban (8). Nurture NU e coloană — e un pool de reactivare
// care crește nelimitat (cronul auto-EXclient + rezilierile toarnă ex-clienți acolo),
// deci trăiește în tab-ul separat „Nurture" (listă căutabilă), nu pe board.
export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { status: 'nou',          label: 'Nou',          text: 'text-zinc-600',    bg: 'bg-zinc-100',    border: 'border-zinc-300',    header: 'bg-slate-500' },
  { status: 'contactat',    label: 'Contactat',    text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    header: 'bg-blue-500' },
  { status: 'waiting_list', label: 'Waiting List', text: 'text-purple-700',  bg: 'bg-purple-50',   border: 'border-purple-200',  header: 'bg-purple-500' },
  { status: 'programat',    label: 'Programat',    text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   header: 'bg-amber-500' },
  { status: 'a_venit',      label: 'A venit',      text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', header: 'bg-emerald-500' },
  { status: 'nu_a_venit',   label: 'Nu a venit',   text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     header: 'bg-rose-500' },
  { status: 'convertit',    label: 'Convertit',    text: 'text-green-700',   bg: 'bg-green-50',    border: 'border-green-300',   header: 'bg-green-600' },
  { status: 'pierdut',      label: 'Pierdut',      text: 'text-zinc-500',    bg: 'bg-zinc-50',     border: 'border-zinc-200',    header: 'bg-zinc-500' },
]

// Nurture rămâne un status valid (badge-uri, modal), dar în afara board-ului.
const NURTURE_COLUMN: PipelineColumn = {
  status: 'nurture', label: 'Nurture', text: 'text-pink-700', bg: 'bg-pink-50', border: 'border-pink-200', header: 'bg-pink-500',
}

// Toate statusurile valide (board + Nurture) — pentru selectorul de status din
// modal, ca un lead Nurture deschis din tab să afișeze corect și să poată fi mutat.
export const ALL_STATUS_COLUMNS: PipelineColumn[] = [
  ...PIPELINE_COLUMNS,
  NURTURE_COLUMN,
]

export const STATUS_CONFIG = Object.fromEntries(
  ALL_STATUS_COLUMNS.map((c) => [c.status, c]),
) as Record<StatusLead, PipelineColumn>

export const SUB_STATUS_OPTIONS: {
  value: 'de_revenit' | 'nu_raspunde'
  label: string
  cls: string
}[] = [
  { value: 'de_revenit',  label: 'De revenit',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'nu_raspunde', label: 'Nu răspunde', cls: 'bg-red-50 text-red-700 border-red-200' },
]

// interes_lead v3 — sincron cu migrations/20260611100000_interes_lead_v3.sql,
// _shared/intake.ts și public/qleads-widget.js.
export const INTERESE = [
  'Street Dance',
  'K-pop',
  'Acrobatică',
  'Zumba',
  'Nu știu încă',
] as const

export const GRUPE: GrupaLead[] = [
  'Tiny',
  'Junior',
  'Varsity',
  'Teens',
  'Students',
  'Adults',
]

// grupa_lead (lead) → varsta_curs (enum-ul cursurilor). Cursurile cu varsta
// 'Mixt' acceptă orice grupă — vezi filtrarea din ScheduleModal.
export const GRUPA_TO_VARSTA_CURS: Record<GrupaLead, string> = {
  Tiny: 'Tiny 4-7',
  Junior: 'Junior 7-10',
  Varsity: 'Varsity 11-15',
  Teens: 'Teens 15-20',
  Students: 'Students 20-25',
  Adults: 'Adults 25+',
}

// Index = JS Date.getDay() (0=Duminică). Aliniat cu enum-ul zi_saptamana.
export const ZILE_SAPTAMANA = [
  'Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata',
] as const

export const GRUPA_LABELS: Record<GrupaLead, string> = {
  Tiny: 'Tiny (4-6 ani)',
  Junior: 'Junior (7-10 ani)',
  Varsity: 'Varsity (11-14 ani)',
  Teens: 'Teens (15-19 ani)',
  Students: 'Students (20-25 ani)',
  Adults: 'Adulți (>25)',
}

// Locațiile relevante pentru lead-uri (folosite și de logica SMS — adresă/review link).
export const LOCATII = ['Ștefan cel Mare', 'Nicolina', 'Quasar 4 Kids'] as const

export const MOTIVE_PIERDUT_RAPIDE = [
  'Programul nu coincide',
  'Copilul nu vrea',
  'A găsit altă școală',
  'Prea scump',
  'Număr greșit / nereachabil',
  'Prea multe activități',
  'Nu mai dorește să fie contactat (opt-out)',
]

// Mesaj precompletat pentru butonul WhatsApp de pe lead.
export function waLeadMessage(lead: {
  prenume: string | null
  nume_parinte: string | null
}): string {
  const salut = lead.nume_parinte || lead.prenume
  return `Bună${salut ? ` ${salut}` : ''}! Suntem Quasar Dance — am primit solicitarea ta. Când te putem suna pentru a stabili ședința gratuită de probă?`
}

const LUNI_SCURT = [
  'ian', 'feb', 'mar', 'apr', 'mai', 'iun',
  'iul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

// True dacă timestamp-ul ISO cade în ziua curentă (ora locală).
// „Umbră de ex-client" = rândul pe care cronul de 02:00 îl creează pentru
// pool-ul de reactivare când un client trece 45 de zile fără prezență. Are
// `created` = data rulării, deci în listă arată ca un lead intrat azi.
// NU e același lucru cu „are id_client": un lead convertit are și el client, dar
// e o conversie, nu o țintă de reactivare — de aceea condiția include statusul.
// Definiție unică: filtrul din bară și eticheta din tabel trebuie să numere
// exact aceleași rânduri.
export function esteExClient(l: Lead): boolean {
  return l.status === 'nurture' && !!l.id_client
}

export function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date()
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

// Data (YYYY-MM-DD, fus local) la `zile` zile distanță de azi. Folosit pentru
// follow-up-ul implicit: când un lead „nu răspunde", revenim peste o săptămână.
export function dataPesteZile(zile: number): string {
  const d = new Date()
  d.setDate(d.getDate() + zile)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Praguri de „neglijență", partajate de panoul „De lucrat azi" și de coloana
// „Ultim contact" din vederea Listă. Trebuie să rămână UNA singură: două praguri
// diferite ar arăta owner-ului două adevăruri despre același lead.
export const FOLLOWUP_DAYS = 7
export const INACTIVE_DAYS = 30

export const DAY_MS = 24 * 60 * 60 * 1000

export type PerioadaPreset =
  | 'tot' | '7z' | '30z' | 'luna_curenta' | 'luna_trecuta' | 'personalizat'

export type Perioada = { preset: PerioadaPreset; de?: string; pana?: string }

export const PERIOADA_LABELS: Record<PerioadaPreset, string> = {
  tot: 'Toată perioada',
  '7z': 'Ultimele 7 zile',
  '30z': 'Ultimele 30 de zile',
  luna_curenta: 'Luna aceasta',
  luna_trecuta: 'Luna trecută',
  personalizat: 'Interval personalizat',
}

// Traduce presetul într-un interval ISO aplicabil pe `created`. Întoarce {} pentru
// „toată perioada" — apelantul omite atunci filtrul din query.
export function perioadaToRange(p: Perioada): { de?: string; pana?: string } {
  const now = new Date()
  switch (p.preset) {
    case 'tot':
      return {}
    case '7z':
    case '30z': {
      const zile = p.preset === '7z' ? 7 : 30
      const de = new Date(now.getTime() - zile * DAY_MS)
      de.setHours(0, 0, 0, 0)
      return { de: de.toISOString() }
    }
    case 'luna_curenta': {
      const de = new Date(now.getFullYear(), now.getMonth(), 1)
      return { de: de.toISOString() }
    }
    case 'luna_trecuta': {
      const de = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const pana = new Date(now.getFullYear(), now.getMonth(), 1)
      return { de: de.toISOString(), pana: pana.toISOString() }
    }
    case 'personalizat': {
      // Inputurile `date` dau YYYY-MM-DD; `pana` include ziua întreagă.
      const de = p.de ? new Date(`${p.de}T00:00:00`).toISOString() : undefined
      const pana = p.pana
        ? new Date(`${p.pana}T23:59:59.999`).toISOString()
        : undefined
      return { de, pana }
    }
  }
}

// Eticheta scurtă a intervalului activ, pentru badge-ul de pe filtru.
export function perioadaLabel(p: Perioada): string {
  if (p.preset !== 'personalizat') return PERIOADA_LABELS[p.preset]
  if (p.de && p.pana) return `${p.de} → ${p.pana}`
  if (p.de) return `din ${p.de}`
  if (p.pana) return `până la ${p.pana}`
  return 'Interval personalizat'
}

// Prepend o notă datată la observații, cu o etichetă de context.
// Ex: prependObservatie('Contactat', 'sunat, indecis', '...existent') →
//     "[Contactat 21 mai] sunat, indecis\n...existent"
export function prependObservatie(
  eticheta: string,
  nota: string,
  existent: string | null,
): string {
  const prev = (existent ?? '').trim()
  if (!nota.trim()) return prev
  const d = new Date()
  const stamp = `${d.getDate()} ${LUNI_SCURT[d.getMonth()]}`
  const linie = `[${eticheta} ${stamp}] ${nota.trim()}`
  return prev ? `${linie}\n${prev}` : linie
}
