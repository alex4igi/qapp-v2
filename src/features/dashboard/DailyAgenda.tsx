import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Spinner, type BadgeTone } from '@/components/ui'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import type { DashboardCourse } from './api'

const ZILE = ['LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SÂM', 'DUM']

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toIso(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(iso: string, n: number): string {
  const dt = parseIso(iso)
  dt.setDate(dt.getDate() + n)
  return toIso(dt)
}
function weekDays(iso: string): Date[] {
  const dt = parseIso(iso)
  const dow = (dt.getDay() + 6) % 7 // luni = 0
  const mon = parseIso(iso)
  mon.setDate(dt.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = parseIso(toIso(mon))
    d.setDate(mon.getDate() + i)
    return d
  })
}

type Status = { text: string; tone: BadgeTone }

// Durata cursului o asumăm ~60 min (nu o avem în datele de dashboard).
const DURATA_MIN = 60

function oraToMin(ora: string | null): number | null {
  if (!ora) return null
  const m = /(\d{1,2}):(\d{2})/.exec(ora)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function nowMin(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

// Pastila de status se calculează din oră vs. ora curentă, doar când privim ziua
// de azi.
function statusPill(ora: string | null, isToday: boolean): Status | null {
  if (!isToday) return null
  const start = oraToMin(ora)
  if (start == null) return null
  const cur = nowMin()
  if (cur < start) return { text: 'Urmează', tone: 'warn' }
  if (cur <= start + DURATA_MIN) return { text: 'Acum', tone: 'success' }
  return { text: 'Încheiat', tone: 'neutral' }
}

// Vederea implicită pe „azi" arată doar orele din jurul momentului: ora curentă (cu
// toate grupele ei — la aceeași oră sunt de obicei două săli), ultima oră încheiată și
// următoarea. Dimineața (nimic încheiat) și seara (nimic de urmat) se completează tot
// la 3 ore, ca lista să nu rămână cu un singur card. Alex, 12 sept 2026: recepția
// vrea „ce e acum", nu 14 carduri de derulat.
function oreInJurulMomentului(courses: DashboardCourse[], cur: number): Set<number> {
  const ore = [...new Set(courses.map((c) => oraToMin(c.ora)).filter((m): m is number => m != null))]
    .sort((a, b) => a - b)
  const acum = ore.filter((o) => o <= cur && cur <= o + DURATA_MIN)
  const incheiate = ore.filter((o) => o + DURATA_MIN < cur)
  const urmatoare = ore.filter((o) => o > cur)
  const keep = new Set(acum)
  if (incheiate.length) keep.add(incheiate[incheiate.length - 1])
  if (urmatoare.length) keep.add(urmatoare[0])
  let iUrm = 1
  let iInch = 2
  while (keep.size < 3) {
    if (iUrm < urmatoare.length) keep.add(urmatoare[iUrm++])
    else if (iInch <= incheiate.length) keep.add(incheiate[incheiate.length - iInch++])
    else break
  }
  return keep
}

// Sub pragul ăsta nu are rost să ascundem nimic (și nici butonul nu apare).
const MIN_GRUPE_PENTRU_RESTRANGERE = 6
// Preferința „vreau toate grupele" se ține minte per browser, ca locația de lucru.
const TOATE_GRUPELE_KEY = 'qapp.dashboard_toate_grupele'

// Culoarea inelului reflectă calitatea prezenței de azi.
function attColor(prezenti: number, enrolled: number): string {
  if (enrolled === 0) return 'var(--color-line-2)'
  const pct = prezenti / enrolled
  if (pct === 0 || pct < 0.5) return 'var(--color-danger)'
  if (pct < 0.8) return 'var(--color-warn)'
  return 'var(--color-success)'
}

function GroupBarCard({
  course,
  to,
  isToday,
}: {
  course: DashboardCourse
  to: string
  isToday: boolean
}) {
  const { numele, ora, sala, teacher, enrolled, prezenti, capacitate, leads, leadsPrezenti } =
    course
  // Inel = rata de prezență a zilei (prezenți / înscriși).
  const attPct = enrolled > 0 ? Math.min(100, Math.round((prezenti / enrolled) * 100)) : 0
  // Bară = rata de ocupare (înscriși / capacitate).
  const occPct =
    capacitate && capacitate > 0
      ? Math.min(100, Math.round((enrolled / capacitate) * 100))
      : null
  const meta = [teacher, sala].filter(Boolean).join(' · ') || '—'
  const pill = statusPill(ora, isToday)
  const ring = attColor(prezenti, enrolled)
  return (
    <Link to={to} className="gcard flex flex-col rounded-[14px] border border-line bg-card p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="fnum font-display text-[15px] font-bold text-ink">{ora ?? '—'}</span>
        {pill && <Badge tone={pill.tone}>{pill.text}</Badge>}
      </div>

      <div className="mt-3.5 flex items-center gap-3.5">
        <div
          className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${ring} ${attPct}%, var(--color-line-2) ${attPct}% 100%)` }}
        >
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-card">
            <span className="fnum font-display text-[13px] font-bold text-ink">
              {enrolled > 0 ? `${attPct}%` : '—'}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-display text-[15px] font-semibold tracking-tight text-ink">
            {numele}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">{meta}</div>
          <div className="mt-1.5 text-[12.5px] text-muted-2">
            <span className="fnum font-display font-bold text-ink">{prezenti}</span> /{' '}
            {enrolled} prezenți
            {/* Leadurile programate azi sunt oameni în sală, dar nu sunt cursanți:
                stau lângă cifră, nu în ea (inelul rămâne rata cursanților). */}
            {leads > 0 && (
              <span
                className="ml-1.5 text-[11.5px] text-muted"
                title={`${leadsPrezenti} ${leadsPrezenti === 1 ? 'prezent' : 'prezenți'} din ${leads} ${leads === 1 ? 'lead programat' : 'leads programate'} azi`}
              >
                +{leads} {leads === 1 ? 'lead' : 'leads'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Ocupare
        </span>
        <span className="fnum text-[12px] font-semibold text-muted-2">
          {occPct != null ? `${occPct}%` : `${enrolled} înscriși`}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line-2">
        <div
          className="h-full rounded-full bg-ink"
          style={{ width: `${occPct ?? 0}%` }}
        />
      </div>
    </Link>
  )
}

const RO_MONTHS = [
  'ian', 'feb', 'mar', 'apr', 'mai', 'iun',
  'iul', 'aug', 'sep', 'oct', 'noi', 'dec',
]

type Props = {
  courses: DashboardCourse[]
  loading: boolean
  isError?: boolean
  emptyMessage: string
  /** false = arată mereu toate grupele (ex. „Grupele mele azi", liste scurte). */
  compact?: boolean
}

export function DailyAgenda({
  courses,
  loading,
  isError,
  emptyMessage,
  compact = true,
}: Props) {
  const { date, setDate, isToday, resetToToday } = useWorkingDate()
  const days = weekDays(date)

  const nGroups = courses.length

  const [toateGrupele, setToateGrupele] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TOATE_GRUPELE_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleToateGrupele = () =>
    setToateGrupele((v) => {
      const next = !v
      try {
        localStorage.setItem(TOATE_GRUPELE_KEY, next ? '1' : '0')
      } catch {
        /* localStorage indisponibil — în memorie e ok */
      }
      return next
    })

  // Restrângerea are sens doar pe „azi" (altfel nu există „acum") și doar când sunt
  // destule grupe ca să merite. Sumarul de mai jos rămâne pe TOATE grupele.
  const restrange =
    compact && isToday && !toateGrupele && nGroups >= MIN_GRUPE_PENTRU_RESTRANGERE
  const vizibile = useMemo(() => {
    if (!restrange) return courses
    const keep = oreInJurulMomentului(courses, nowMin())
    return courses.filter((c) => {
      const m = oraToMin(c.ora)
      return m == null || keep.has(m)
    })
  }, [courses, restrange])
  const ascunse = nGroups - vizibile.length
  const arataButon =
    compact && isToday && nGroups >= MIN_GRUPE_PENTRU_RESTRANGERE && (toateGrupele || ascunse > 0)
  const prezentiMarcati = courses.reduce((a, c) => a + c.prezenti, 0)
  const ramase = isToday
    ? courses.filter((c) => {
        const p = statusPill(c.ora, true)
        return p?.text === 'Acum' || p?.text === 'Urmează'
      }).length
    : null

  return (
    <div className="mb-6">
      {/* strip zile + navigare */}
      {/* Pe telefon cele 7 zile + navigatorul nu încap pe un rând: zilele rămân
          sus, controalele coboară dedesubt. */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex flex-1 gap-1 md:gap-2">
          {days.map((d) => {
            const iso = toIso(d)
            const active = iso === date
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setDate(iso)}
                className={[
                  'min-w-0 flex-1 rounded-[11px] py-2.5 text-center transition-colors',
                  active ? 'bg-rail text-white' : 'bg-card hover:bg-rowhover',
                  !active && weekend ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'text-[11px] font-semibold',
                    active ? 'text-quasar-yellow' : 'text-muted',
                  ].join(' ')}
                >
                  {ZILE[(d.getDay() + 6) % 7]}
                </div>
                <div
                  className={[
                    'fnum mt-0.5 font-display text-base font-semibold',
                    active ? 'text-white' : 'text-ink',
                  ].join(' ')}
                >
                  {d.getDate()}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5 max-md:justify-between">
          <div className="flex items-center overflow-hidden rounded-[10px] border border-line bg-card">
            <button
              type="button"
              onClick={() => setDate(addDays(date, -1))}
              className="px-2.5 py-2 text-muted-2 hover:bg-surface"
              aria-label="Ziua anterioară"
            >
              ‹
            </button>
            <span className="fnum border-x border-line px-3 py-2 text-[13px] font-semibold text-ink">
              {parseIso(date).getDate()} {RO_MONTHS[parseIso(date).getMonth()]}
            </span>
            <button
              type="button"
              onClick={() => setDate(addDays(date, 1))}
              className="px-2.5 py-2 text-muted-2 hover:bg-surface"
              aria-label="Ziua următoare"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={resetToToday}
            className="rounded-[10px] bg-ink px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:brightness-110"
          >
            Azi
          </button>
        </div>
      </div>

      {/* sumar */}
      {!loading && !isError && nGroups > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            <span className="fnum mr-1 font-semibold text-ink">{nGroups}</span> grupe
          </Badge>
          <Badge tone="success">
            <span className="fnum mr-1 font-bold">{prezentiMarcati}</span> prezenți marcați
          </Badge>
          {ramase != null && (
            <Badge tone="warn">
              <span className="fnum mr-1 font-bold">{ramase}</span> grupe rămase azi
            </Badge>
          )}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-danger">Eroare la încărcarea cursurilor.</p>
      ) : nGroups === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {vizibile.map((c) => (
              <GroupBarCard
                key={c.id}
                course={c}
                isToday={isToday}
                to={`/grupa/${c.id}`}
              />
            ))}
          </div>
          {arataButon && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={toggleToateGrupele}
                className="rounded-[10px] border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-muted-2 transition-colors hover:border-quasar-yellow hover:text-ink"
              >
                {toateGrupele
                  ? 'Arată doar grupele din jurul orei'
                  : `Arată toate cele ${nGroups} grupe`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
