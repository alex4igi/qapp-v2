import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs, Badge, WhatsAppIcon, type BadgeTone } from '@/components/ui'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { canMesajGrupa, isFrontDeskOrHigher, isTeacher } from '@/lib/rolesMatrix'
import { ComposeMesajGrupaModal } from '@/features/announcements/ComposeMesajGrupaModal'
import { LectieBanner } from '@/features/metodologic/components/LectieBanner'
import { EvaluariCountdown } from '@/features/evaluari/components/EvaluariCountdown'
import { upsertPrezenta } from '@/features/prezente/api'
import { marcheazaPrezentaLeadCurs, updateLeadStatus } from '@/features/leads/api'
import { formatRON, formatDate, formatMonth } from '@/lib/format'
import { vineLaLabel } from '@/lib/ultimaPrezenta'
import { waLink, waGroupLink } from '@/lib/phone'
import { listSezoane } from '@/features/plati/api'
import { getCursDatorii } from '@/features/cursuri/api'
import { RestantieriTab } from '@/features/cursuri/pages/CursProfilePage/tabs/RestantieriTab'
import {
  getGrupaDashboard,
  type RosterStatus,
  type GrupaRosterRow,
  type GrupaFostRow,
  type GrupaDashboard,
} from './api'

type RosterView = 'cards' | 'list' | 'cols'

const STATUS_LABEL: Record<RosterStatus, string> = {
  prezent: 'Prezent',
  absent: 'Absent',
  programat: 'Programat',
  inactiv: 'Inactiv',
}
const STATUS_TONE: Record<RosterStatus, BadgeTone> = {
  prezent: 'success',
  absent: 'danger',
  programat: 'warn',
  inactiv: 'neutral',
}

function initialsOf(nume: string, prenume: string | null): string {
  return `${nume?.[0] ?? ''}${prenume?.[0] ?? ''}`.toUpperCase() || '?'
}

// Mesaj pre-completat pentru WhatsApp către părintele cursantului.
function waParinteMessage(prenume: string): string {
  return `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${prenume}.`
}

// Stil card de cursant — preluat 1:1 din designul Claude „Quasar OS - Grupe & Roster"
// (varianta „Carduri"): card alb cu tentă subtilă după status, avatar rotund cu dot,
// notificări la dreapta. bg=fundal, bd=bordură, ab/ac=fundal/text avatar, dot=indicator,
// lc=culoare etichetă status, dim=estompare pentru inactivi.
type McardStyle = {
  bg: string
  bd: string
  ab: string
  ac: string
  dot: string
  lc: string
  dim: boolean
}
const MCARD: Record<RosterStatus, McardStyle> = {
  prezent: { bg: '#F8FBF9', bd: '#E1EFE7', ab: '#E7F4EE', ac: '#1E8A5B', dot: '#1E8A5B', lc: '#1E8A5B', dim: false },
  absent: { bg: '#FEF7F7', bd: '#F4DCDC', ab: '#FBEAEA', ac: '#D64545', dot: '#D64545', lc: '#D64545', dim: false },
  programat: { bg: '#FFFCEC', bd: '#F3E7AE', ab: '#FFF6C2', ac: '#9A7B00', dot: '#FFD600', lc: '#9A7B00', dim: false },
  inactiv: { bg: '#F7F6F2', bd: '#EAE6DD', ab: '#EFEBE3', ac: '#8A857C', dot: '#B5B0A6', lc: '#8A857C', dim: true },
}

// Refuz GDPR de imagine (copilul sau familia). Teacherul trebuie să-l vadă
// ÎNAINTE să scoată telefonul, deci stă pe card, nu doar în fișa clientului.
function FaraPozeBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={
        // Negru, pătrat: cardul folosește deja verde/roșu/galben pentru status și
        // cercuri pentru butoane — badge-ul nu are voie să semene cu niciunul.
        'inline-flex shrink-0 items-center justify-center bg-ink text-white ' +
        (compact ? 'h-[18px] w-[18px] rounded' : 'h-6 w-6 rounded-md')
      }
      title="Fără poze — nu are acord de imagine (GDPR)"
      aria-label="Fără poze — nu are acord de imagine"
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? 'h-3 w-3' : 'h-[15px] w-[15px]'}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 2l20 20" />
        <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16" />
        <path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5" />
        <path d="M14.12 15.12A3 3 0 1 1 9.88 10.88" />
      </svg>
    </span>
  )
}

function ClientCard({
  row,
  canPay,
  onPay,
  onTogglePrezenta,
  onReactivate,
  togglePending,
}: {
  row: GrupaRosterRow
  canPay: boolean
  onPay: (clientId: string) => void
  onTogglePrezenta: (row: GrupaRosterRow) => void
  onReactivate: (row: GrupaRosterRow) => void
  togglePending: boolean
}) {
  const navigate = useNavigate()
  const name = [row.nume, row.prenume].filter(Boolean).join(', ')
  const isLead = row.kind === 'lead'
  const showPay = !isLead && row.status !== 'inactiv' && row.restanta > 0
  // Reactivarea „inactiv" se aplică doar cursanților — leads nu pot fi „inactivi"
  const isInactiv = !isLead && row.status === 'inactiv'
  const nextLabel = isInactiv
    ? 'Reactivează'
    : row.status === 'prezent'
      ? 'Marchează absent'
      : 'Marchează prezent'
  const handlePhotoClick = () => {
    if (isInactiv) onReactivate(row)
    else onTogglePrezenta(row)
  }
  const navTarget = isLead ? `/leads?lead=${row.refId}` : `/clienti/${row.refId}`
  // Contact părinte pe WhatsApp — doar cursanți cu telefon mobil valid.
  const waHref = isLead
    ? null
    : waLink(row.telefon, waParinteMessage(row.prenume || row.nume))

  const st = MCARD[row.status]
  return (
    <div
      onClick={togglePending ? undefined : handlePhotoClick}
      role="button"
      aria-label={nextLabel}
      title={nextLabel}
      className={
        'mcard flex items-center gap-2.5 rounded-[11px] border px-[13px] py-[11px] max-md:gap-3 max-md:py-3' +
        (row.esteZiua ? ' ring-2 ring-quasar-yellow ring-offset-1' : '')
      }
      style={{
        background: st.bg,
        borderColor: st.bd,
        opacity: st.dim ? 0.62 : 1,
        cursor: togglePending ? 'wait' : 'pointer',
      }}
    >
      <div className="relative h-10 w-10 shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-bold"
          style={{ background: st.ab, color: st.ac }}
        >
          {row.poza ? (
            <img src={row.poza} alt={name} className="h-full w-full object-cover" />
          ) : (
            initialsOf(row.nume, row.prenume)
          )}
        </div>
        <span
          className="absolute -bottom-px -right-px h-[13px] w-[13px] rounded-full border-[2.5px] border-white"
          style={{ background: st.dot }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink max-md:whitespace-normal">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: st.lc }}>
          <span>{STATUS_LABEL[row.status]}</span>
          {isLead && (
            <span className="rounded bg-blue-600 px-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Lead
            </span>
          )}
        </div>
      </div>
      {row.faraPoze && <FaraPozeBadge />}
      {row.esteZiua && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-quasar-yellow px-1.5 py-0.5 text-[10px] font-bold text-ink"
          title="Aniversare azi"
        >
          🎂 Ziua!
        </span>
      )}
      {showPay && (
        <button
          type="button"
          disabled={!canPay}
          onClick={(e) => {
            e.stopPropagation()
            onPay(row.refId)
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-quasar-yellow font-display text-[13px] font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-45 max-md:h-9 max-md:w-9"
          title={
            canPay
              ? `Plată restanță: ${formatRON(row.restanta)}`
              : `Restanță ${formatRON(row.restanta)} — încasările le face recepția`
          }
          aria-label={`Restanță ${formatRON(row.restanta)}`}
        >
          $
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          navigate(navTarget)
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white/75 text-[#6B6760] max-md:h-9 max-md:w-9"
        style={{ borderColor: st.bd }}
        aria-label={isLead ? 'Vezi în pipeline leads' : 'Profil cursant'}
        title={isLead ? 'Vezi în pipeline leads' : 'Profil cursant'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        </svg>
      </button>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-white/75 text-success max-md:h-9 max-md:w-9"
          aria-label="Scrie părintelui pe WhatsApp"
          title="Scrie părintelui pe WhatsApp"
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
          </svg>
        </a>
      )}
    </div>
  )
}

/* ---------- roster: variantă Listă ---------- */
function RosterList({
  rows,
  canPay,
  onMemberClick,
  onPay,
  navigate,
}: {
  rows: GrupaRosterRow[]
  canPay: boolean
  onMemberClick: (row: GrupaRosterRow) => void
  onPay: (clientId: string) => void
  navigate: (to: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      {rows.map((r) => {
        const isLead = r.kind === 'lead'
        const name = [r.nume, r.prenume].filter(Boolean).join(' ')
        return (
          <div
            key={r.rowId}
            onClick={() => onMemberClick(r)}
            className="qrow flex cursor-pointer items-center gap-3 border-t border-line-2 px-4 py-2.5 first:border-t-0"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-[11px] font-bold text-muted-2">
              {initialsOf(r.nume, r.prenume)}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium text-ink">{name}</span>
              {isLead && <Badge tone="warn">LEAD</Badge>}
            </span>
            {r.faraPoze && <FaraPozeBadge />}
            {r.esteZiua && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-quasar-yellow px-1.5 py-0.5 text-[10px] font-bold text-ink"
                title="Aniversare azi"
              >
                🎂 Ziua!
              </span>
            )}
            {r.restanta > 0 && (
              <span className="fnum text-sm font-bold text-danger">
                {formatRON(r.restanta)}
              </span>
            )}
            {!isLead && r.status !== 'inactiv' && r.restanta > 0 && (
              <button
                type="button"
                disabled={!canPay}
                onClick={(e) => {
                  e.stopPropagation()
                  onPay(r.refId)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-bg text-sm font-bold text-danger ring-1 ring-danger/30 hover:bg-quasar-yellow hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-danger-bg disabled:hover:text-danger"
                title={canPay ? 'Plată restanță' : 'Încasările le face recepția'}
              >
                $
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigate(isLead ? '/leads' : `/clienti/${r.refId}`)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-sm hover:bg-rowhover"
              title="Profil"
            >
              👤
            </button>
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- roster: variantă Coloane pe status ---------- */
const COLS: { status: RosterStatus; title: string }[] = [
  { status: 'prezent', title: 'Prezenți' },
  { status: 'absent', title: 'Absenți' },
  { status: 'programat', title: 'Programați' },
  { status: 'inactiv', title: 'Inactivi' },
]

function RosterColumns({
  rows,
  onMemberClick,
}: {
  rows: GrupaRosterRow[]
  onMemberClick: (row: GrupaRosterRow) => void
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLS.map((col) => {
        const members = rows.filter((r) => r.status === col.status)
        return (
          <div key={col.status} className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Badge tone={STATUS_TONE[col.status]}>{col.title}</Badge>
              <span className="fnum ml-auto text-xs font-semibold text-muted">
                {members.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {members.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted">— niciun cursant —</div>
              ) : (
                members.map((m) => (
                  <button
                    key={m.rowId}
                    type="button"
                    onClick={() => onMemberClick(m)}
                    className="mcard flex items-center gap-2 rounded-[11px] border border-line bg-card px-2.5 py-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-[10px] font-bold text-muted-2">
                      {initialsOf(m.nume, m.prenume)}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] font-medium text-ink">
                      {[m.nume, m.prenume].filter(Boolean).join(' ')}
                    </span>
                    {m.faraPoze && <FaraPozeBadge compact />}
                    {m.esteZiua && (
                      <span
                        className="inline-flex shrink-0 items-center rounded-full bg-quasar-yellow px-1 py-0.5 text-[10px] font-bold text-ink"
                        title="Aniversare azi"
                      >
                        🎂
                      </span>
                    )}
                    {m.restanta > 0 && (
                      <span className="h-2 w-2 rounded-full bg-danger" title="Restanță" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- foști cursanți: listă de recuperare ---------- */
function FostiSection({
  rows,
  cursNume,
  canEnroll,
  onReinrol,
  navigate,
}: {
  rows: GrupaFostRow[]
  cursNume: string
  canEnroll: boolean
  onReinrol: (clientId: string) => void
  navigate: (to: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[13px] font-semibold text-ink">
          Foști cursanți — de recuperat
        </span>
        <Badge tone="neutral">{rows.length}</Badge>
        <span className="flex-1" />
        <span className="text-xs text-muted">{open ? 'Ascunde' : 'Arată'}</span>
      </button>

      {open && (
        <>
          <div className="border-t border-line-2 px-4 py-2 text-xs text-muted">
            Au fost pe această grupă în ultimele 6 luni, dar nu mai au înrolare pe
            luna curentă — de aceea nu apar în roster și nu li se poate pune prezența.
            Cei marcați cu ↪ vin în continuare, la altă grupă sau la aceeași grupă
            din sezonul nou — pe ei nu-i suna ca pe cei pierduți.
          </div>
          {rows.map((f) => {
            const name = [f.nume, f.prenume].filter(Boolean).join(' ')
            const waHref = waLink(f.telefon, waParinteMessage(f.prenume || f.nume))
            return (
              <div
                key={f.clientId}
                className="flex items-center gap-3 border-t border-line-2 px-4 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-bg text-[11px] font-bold text-muted-2">
                  {f.poza ? (
                    <img src={f.poza} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(f.nume, f.prenume)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {name}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {f.ultimaPrezenta
                      ? `ultima prezență pe această grupă ${formatDate(f.ultimaPrezenta)}`
                      : f.ultimaLuna
                        ? `ultima înrolare ${formatMonth(f.ultimaLuna)}`
                        : '—'}
                  </span>
                  {f.vineLa && (
                    <span className="block truncate text-[11px] font-medium text-success">
                      ↪ vine la {vineLaLabel(f.vineLa, cursNume)} —{' '}
                      {formatDate(f.vineLa.data)}
                    </span>
                  )}
                </span>
                {canEnroll && (
                  <Button
                    variant="secondary"
                    onClick={() => onReinrol(f.clientId)}
                    title="Înrolează din nou pe această grupă"
                  >
                    Reînrolează
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/clienti/${f.clientId}`)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-card text-muted-2"
                  aria-label="Profil cursant"
                  title="Profil cursant"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <circle cx="12" cy="8" r="3.4" />
                    <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
                  </svg>
                </button>
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-card text-success"
                    aria-label="Scrie părintelui pe WhatsApp"
                    title="Scrie părintelui pe WhatsApp"
                  >
                    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true">
                      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                    </svg>
                  </a>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export function GrupaDashboardPage() {
  const { cursId } = useParams<{ cursId: string }>()
  const navigate = useNavigate()
  const { date } = useWorkingDate()
  const { role } = useAuth()
  const isMobile = useIsMobile()
  // Înrolarea și încasarea sunt responsabilitatea front_desk/manager — teacherul
  // nu vede acțiunile de înrolare și are plata dezactivată (RLS pe
  // enrollments/incasari oricum îl blochează).
  const canDeskActions = isFrontDeskOrHigher(role)
  // Pe telefon rămân doar acțiunile care se fac din sală. Încasarea și înrolarea
  // trec prin modale de 700+ linii, gândite pentru ecranul de la recepție.
  const canDeskActionsHere = canDeskActions && !isMobile
  const canSendMesajGrupa = canMesajGrupa(role)
  const queryClient = useQueryClient()
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [mesajOpen, setMesajOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // Pre-selectează cursantul în modalul de înrolare (reînrolare din lista „foști").
  const [addClientId, setAddClientId] = useState<string | null>(null)
  const [tab, setTab] = useState<'roster' | 'restantieri'>('roster')
  const [rosterView, setRosterView] = useState<RosterView>(() => {
    try {
      return (localStorage.getItem('qapp.roster_view') as RosterView) || 'cards'
    } catch {
      return 'cards'
    }
  })
  const setView = (v: RosterView) => {
    setRosterView(v)
    try {
      localStorage.setItem('qapp.roster_view', v)
    } catch {
      /* localStorage indisponibil */
    }
  }
  // Pe telefon doar cardurile cu poză au sens (degetul are nevoie de suprafață),
  // iar preferința salvată de pe desktop nu se scurge aici.
  const view: RosterView = isMobile ? 'cards' : rosterView

  const { data, isLoading, isError } = useQuery({
    queryKey: ['grupa-dashboard', cursId, date],
    queryFn: () => getGrupaDashboard({ cursId: cursId!, date }),
    enabled: Boolean(cursId),
  })

  // Sezonul curent + restanțierii cursului (tab Restanțieri) — refolosesc logica fișei cursului.
  const sezoaneQ = useQuery({ queryKey: ['sezoane-list'], queryFn: listSezoane })
  const sezon = useMemo(() => {
    const list = sezoaneQ.data ?? []
    if (!list.length) return null
    const today = new Date().toISOString().slice(0, 10)
    return (
      list.find(
        (s) =>
          s.data_incepere &&
          s.data_final &&
          s.data_incepere <= today &&
          today <= s.data_final,
      ) ?? list[0]
    )
  }, [sezoaneQ.data])
  const restantieriQ = useQuery({
    queryKey: ['curs', cursId, 'restantieri', sezon?.id],
    queryFn: () =>
      getCursDatorii({
        cursId: cursId!,
        sezonStart: sezon!.data_incepere!,
        sezonEnd: sezon!.data_final!,
      }),
    enabled:
      tab === 'restantieri' &&
      Boolean(cursId && sezon?.data_incepere && sezon?.data_final),
  })

  // Rosterul vine deja sortat alfabetic din server (grupa.ts). Ordinea e stabilă
  // prin ea însăși — numele nu depinde de status, deci toggle Prezent↔Absent nu
  // re-sortează grila, iar un cursant nou intră direct pe poziția lui alfabetică.
  const orderedRoster = data?.roster ?? []

  const toggleMut = useMutation({
    mutationFn: async (row: GrupaRosterRow) => {
      if (row.kind === 'lead') {
        const prezent = row.status !== 'prezent'
        // Teacherul nu poate scrie în leads/programari_leads (RLS) — RPC-ul
        // marchează doar prezența, fără efectele de pipeline ale recepției.
        if (isTeacher(role)) {
          await marcheazaPrezentaLeadCurs(
            row.refId,
            cursId!,
            date,
            prezent ? 'prezent' : 'programat',
          )
        } else {
          // Scope pe (curs, zi): fără el, prezența ateriza pe ultima programare a
          // lead-ului — putea fi alt curs sau altă zi.
          // Debifarea = click greșit, nu neprezentare: leadul revine în Programat
          // (exact ce arată UI-ul). `nu_a_venit` aici trimitea pe loc SMS-ul „ne
          // pare rău că nu ai ajuns". Neprezentarea reală o pune prune-ul, după zi.
          await updateLeadStatus(
            row.refId,
            prezent ? 'a_venit' : 'programat',
            { cursId: cursId!, data: date },
          )
        }
      } else {
        await upsertPrezenta({
          enrollmentId: row.enrollmentId!,
          clientId: row.refId,
          data: date,
          status: row.status === 'prezent' ? 'Absent' : 'Prezent',
        })
      }
    },
    onMutate: async (row: GrupaRosterRow) => {
      const key = ['grupa-dashboard', cursId, date]
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<GrupaDashboard>(key)
      queryClient.setQueryData<GrupaDashboard>(key, (old) => {
        if (!old) return old
        // client: prezent<->absent (inactiv la click => devine prezent).
        // lead:   prezent<->programat (a_venit / nu_a_venit).
        const next: RosterStatus =
          row.status === 'prezent'
            ? row.kind === 'lead'
              ? 'programat'
              : 'absent'
            : 'prezent'
        const roster = old.roster.map((r) =>
          r.rowId === row.rowId ? { ...r, status: next } : r,
        )
        const counters = roster.reduce(
          (acc, r) => {
            const k =
              r.status === 'prezent'
                ? 'prezenti'
                : r.status === 'absent'
                  ? 'absenti'
                  : r.status === 'inactiv'
                    ? 'inactivi'
                    : 'programati'
            acc[k]++
            return acc
          },
          { prezenti: 0, absenti: 0, inactivi: 0, programati: 0 },
        )
        return { ...old, roster, counters }
      })
      return { prev }
    },
    onError: (_e, _row, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['grupa-dashboard', cursId, date], ctx.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['grupa-dashboard', cursId, date],
      })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div>
        <p className="text-sm text-red-600">Eroare la încărcare.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate(-1)}
        >
          ← Înapoi
        </Button>
      </div>
    )
  }

  const meta = [data.teacher, data.sala, data.ora].filter(Boolean).join(' · ')
  const initials =
    data.cursNume.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() ||
    '?'
  const present = data.counters.prezenti
  const enrolled =
    data.counters.prezenti + data.counters.absenti + data.counters.programati
  const occPct = enrolled > 0 ? Math.min(100, Math.round((present / enrolled) * 100)) : 0

  // Click pe un cursant „inactiv" = revine la grupă → îl marcăm Prezent azi.
  // (Cardul e mereu un cursant deja înrolat care acoperă luna — de aia e în
  // roster; nu are nevoie de o înrolare nouă, doar de bifă.) Facultativ și
  // recurent la fel; per-ședință facultativ nu ajunge niciodată „inactiv".
  const handleMemberClick = (row: GrupaRosterRow) => {
    const isInactiv = row.kind !== 'lead' && row.status === 'inactiv'
    if (isInactiv) {
      const name = [row.nume, row.prenume].filter(Boolean).join(' ')
      if (window.confirm(`${name} revine la grupă? Va fi marcat Prezent azi.`)) {
        toggleMut.mutate(row)
      }
    } else {
      toggleMut.mutate(row)
    }
  }

  const seg = (active: boolean) =>
    [
      'rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors',
      active ? 'bg-ink text-white' : 'text-muted-2 hover:text-ink',
    ].join(' ')

  return (
    <div>
      {/* header dark */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          ‹ Program
        </Button>
        <div className="flex-1" />
        {canSendMesajGrupa && (
          <Button variant="secondary" onClick={() => setMesajOpen(true)}>
            💬 Mesaj grupă
          </Button>
        )}
        {waGroupLink(data.linkWhatsapp) && (
          <a
            href={waGroupLink(data.linkWhatsapp)!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
            title="Deschide grupul de WhatsApp al grupei"
          >
            <WhatsAppIcon />
            Grup WhatsApp
          </a>
        )}
        {!isMobile && (
          <Button variant="secondary" onClick={() => navigate(`/cursuri/${cursId}`)}>
            Editează grupa
          </Button>
        )}
      </div>

      <div className="flex items-center gap-5 rounded-2xl bg-rail p-6 text-white max-md:flex-wrap max-md:gap-4 max-md:p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-quasar-yellow font-display text-2xl font-bold text-ink max-md:h-12 max-md:w-12 max-md:text-xl">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate(`/cursuri/${cursId}`)}
            className="block w-full truncate text-left font-display text-xl font-bold tracking-tight transition-colors hover:text-quasar-yellow"
          >
            {data.cursNume}
          </button>
          <div className="mt-1 truncate text-[13px] text-rail-soft">{meta || '—'}</div>
        </div>
        <div className="text-right max-md:w-full max-md:text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-quasar-yellow">
            Prezenți azi
          </div>
          <div className="fnum mt-1 font-display text-2xl font-bold">
            {present} <span className="text-base text-rail-soft">/ {enrolled}</span>
          </div>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-rail-2 max-md:w-full">
            <div
              className="h-full rounded-full bg-quasar-yellow"
              style={{ width: `${occPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* lecția zilei din programul metodologic (nimic dacă grupa n-are program) */}
      <div className="mt-5">
        <LectieBanner cursId={cursId!} data={date} />
        <EvaluariCountdown cursId={cursId} variant="inline" />
      </div>

      {/* tab-uri */}
      <div className="mt-5">
        <Tabs
          tabs={[
            { id: 'roster', label: 'Roster' },
            { id: 'restantieri', label: 'Restanțieri' },
          ]}
          active={tab}
          onChange={(t) => setTab(t as 'roster' | 'restantieri')}
        />
      </div>

      {tab === 'roster' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{data.counters.prezenti} prezenți</Badge>
              <Badge tone="danger">{data.counters.absenti} absenți</Badge>
              <Badge tone="warn">{data.counters.programati} programați</Badge>
              <Badge tone="neutral">{data.counters.inactivi} inactivi</Badge>
            </div>
            {!isMobile && (
              <div className="flex items-center gap-1 rounded-[10px] border border-line bg-card p-1">
                <button type="button" onClick={() => setView('cards')} className={seg(rosterView === 'cards')}>
                  Carduri
                </button>
                <button type="button" onClick={() => setView('list')} className={seg(rosterView === 'list')}>
                  Listă
                </button>
                <button type="button" onClick={() => setView('cols')} className={seg(rosterView === 'cols')}>
                  Coloane
                </button>
              </div>
            )}
          </div>
          <div className="mb-3 text-xs text-muted">
            💡 Apasă pe un cursant pentru a marca prezent / absent
          </div>

          {data.roster.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
              Niciun cursant sau lead în roster.
            </p>
          ) : view === 'list' ? (
            <RosterList
              rows={orderedRoster}
              canPay={canDeskActionsHere}
              onMemberClick={handleMemberClick}
              onPay={(id) => setPayClientId(id)}
              navigate={(to) => navigate(to)}
            />
          ) : view === 'cols' ? (
            <RosterColumns rows={orderedRoster} onMemberClick={handleMemberClick} />
          ) : (
            <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {orderedRoster.map((r) => (
                <ClientCard
                  key={r.rowId}
                  row={r}
                  canPay={canDeskActionsHere}
                  onPay={(id) => setPayClientId(id)}
                  onTogglePrezenta={(row) => toggleMut.mutate(row)}
                  onReactivate={(row) => {
                    const name = [row.nume, row.prenume].filter(Boolean).join(' ')
                    if (
                      window.confirm(`${name} revine la grupă? Va fi marcat Prezent azi.`)
                    ) {
                      toggleMut.mutate(row)
                    }
                  }}
                  togglePending={
                    toggleMut.isPending && toggleMut.variables?.rowId === r.rowId
                  }
                />
              ))}
              {canDeskActionsHere && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-dashed border-line px-[13px] py-[11px] text-sm font-semibold text-muted transition-colors hover:border-quasar-yellow hover:text-ink"
                >
                  + Adaugă cursant
                </button>
              )}
            </div>
          )}

          <FostiSection
            rows={data.fosti}
            cursNume={data.cursNume}
            canEnroll={canDeskActionsHere}
            onReinrol={(clientId) => {
              setAddClientId(clientId)
              setAddOpen(true)
            }}
            navigate={(to) => navigate(to)}
          />
        </>
      )}

      {tab === 'restantieri' && (
        <div className="mt-2">
          <RestantieriTab
            loading={restantieriQ.isLoading}
            rows={restantieriQ.data ?? []}
            canPay={canDeskActionsHere}
            onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            onPayClick={(cid) => setPayClientId(cid)}
          />
        </div>
      )}

      {payClientId && (
        <PlataNouaModal
          open
          defaultClientId={payClientId}
          onClose={() => setPayClientId(null)}
        />
      )}
      {mesajOpen && (
        <ComposeMesajGrupaModal
          open
          cursId={data.cursId}
          cursNume={data.cursNume}
          onClose={() => setMesajOpen(false)}
        />
      )}
      {addOpen && (
        <EnrollmentForm
          open
          defaultCursId={cursId}
          defaultClientId={addClientId ?? undefined}
          onClose={() => {
            setAddOpen(false)
            setAddClientId(null)
            void queryClient.invalidateQueries({
              queryKey: ['grupa-dashboard', cursId, date],
            })
          }}
        />
      )}
    </div>
  )
}
