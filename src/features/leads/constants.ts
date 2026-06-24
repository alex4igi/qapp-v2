import type { StatusLead, GrupaLead } from '@/types/db'

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

export const STATUS_CONFIG = Object.fromEntries(
  [...PIPELINE_COLUMNS, NURTURE_COLUMN].map((c) => [c.status, c]),
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
export const LOCATII = ['Ștefan cel Mare', 'Nicolina'] as const

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
