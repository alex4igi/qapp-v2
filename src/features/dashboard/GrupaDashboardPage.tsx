import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs, Badge, type BadgeTone } from '@/components/ui'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { upsertPrezenta } from '@/features/prezente/api'
import { updateLeadStatus } from '@/features/leads/api'
import { formatRON } from '@/lib/format'
import { waLink } from '@/lib/phone'
import { listSezoane } from '@/features/plati/api'
import { getCursDatorii } from '@/features/cursuri/api'
import { RestantieriTab } from '@/features/cursuri/pages/CursProfilePage/tabs/RestantieriTab'
import {
  getGrupaDashboard,
  type RosterStatus,
  type GrupaRosterRow,
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

function ClientCard({
  row,
  onPay,
  onTogglePrezenta,
  onReactivateRecurent,
  onReactivateFacultativ,
  togglePending,
  facultativ,
}: {
  row: GrupaRosterRow
  onPay: (clientId: string) => void
  onTogglePrezenta: (row: GrupaRosterRow) => void
  onReactivateRecurent: (row: GrupaRosterRow) => void
  onReactivateFacultativ: (row: GrupaRosterRow) => void
  togglePending: boolean
  facultativ: boolean
}) {
  const navigate = useNavigate()
  const name = [row.nume, row.prenume].filter(Boolean).join(', ')
  const isLead = row.kind === 'lead'
  const showPay = !isLead && row.status !== 'inactiv' && row.restanta > 0
  // Reactivarea „inactiv" se aplică doar cursanților — leads nu pot fi „inactivi"
  const isInactiv = !isLead && row.status === 'inactiv'
  const nextLabel = isInactiv
    ? facultativ
      ? 'Înrolare nouă'
      : 'Reactivează'
    : row.status === 'prezent'
      ? 'Marchează absent'
      : 'Marchează prezent'
  const handlePhotoClick = () => {
    if (isInactiv) {
      if (facultativ) onReactivateFacultativ(row)
      else onReactivateRecurent(row)
    } else {
      onTogglePrezenta(row)
    }
  }
  const navTarget = isLead ? '/leads' : `/clienti/${row.refId}`
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
      className="mcard flex items-center gap-2.5 rounded-[11px] border px-[13px] py-[11px]"
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
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: st.lc }}>
          <span>{STATUS_LABEL[row.status]}</span>
          {isLead && (
            <span className="rounded bg-blue-600 px-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Lead
            </span>
          )}
        </div>
      </div>
      {row.esteZiua && (
        <span className="inline-flex items-center text-sm" title="Aniversare azi">
          🎂
        </span>
      )}
      {showPay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPay(row.refId)
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-quasar-yellow font-display text-[13px] font-extrabold text-ink"
          title={`Plată restanță: ${formatRON(row.restanta)}`}
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
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white/75 text-[#6B6760]"
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-white/75 text-success"
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
  onMemberClick,
  onPay,
  navigate,
}: {
  rows: GrupaRosterRow[]
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
            {r.esteZiua && <span title="Aniversare azi">🎂</span>}
            {r.restanta > 0 && (
              <span className="fnum text-sm font-bold text-danger">
                {formatRON(r.restanta)}
              </span>
            )}
            {!isLead && r.status !== 'inactiv' && r.restanta > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPay(r.refId)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-bg text-sm font-bold text-danger ring-1 ring-danger/30 hover:bg-quasar-yellow hover:text-ink"
                title="Plată restanță"
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
                    {m.esteZiua && <span title="Aniversare azi">🎂</span>}
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

export function GrupaDashboardPage() {
  const { cursId } = useParams<{ cursId: string }>()
  const navigate = useNavigate()
  const { date } = useWorkingDate()
  const queryClient = useQueryClient()
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [enrollClientId, setEnrollClientId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
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

  // Ordine stabilă: fixăm pozițiile cardurilor la primul fetch pentru această
  // combinație curs+zi, ca toggle Prezent↔Absent să nu re-sorteze grila.
  // Reset la schimbare de curs/zi.
  const [stableOrder, setStableOrder] = useState<string[] | null>(null)
  useEffect(() => {
    setStableOrder(null)
  }, [cursId, date])
  useEffect(() => {
    if (data && stableOrder === null) {
      setStableOrder(data.roster.map((r) => r.rowId))
    }
  }, [data, stableOrder])

  const orderedRoster = useMemo(() => {
    if (!data) return []
    if (!stableOrder) return data.roster
    const byId = new Map(data.roster.map((r) => [r.rowId, r]))
    const ordered = stableOrder
      .map((id) => byId.get(id))
      .filter((r): r is GrupaRosterRow => Boolean(r))
    const seen = new Set(stableOrder)
    for (const r of data.roster) {
      if (!seen.has(r.rowId)) ordered.push(r)
    }
    return ordered
  }, [data, stableOrder])

  const toggleMut = useMutation({
    mutationFn: async (row: GrupaRosterRow) => {
      if (row.kind === 'lead') {
        const newStatus = row.status === 'prezent' ? 'nu_a_venit' : 'a_venit'
        await updateLeadStatus(row.refId, newStatus)
      } else {
        await upsertPrezenta({
          enrollmentId: row.enrollmentId!,
          clientId: row.refId,
          data: date,
          status: row.status === 'prezent' ? 'Absent' : 'Prezent',
        })
      }
    },
    onSuccess: () => {
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

  const handleMemberClick = (row: GrupaRosterRow) => {
    const isInactiv = row.kind !== 'lead' && row.status === 'inactiv'
    if (isInactiv) {
      if (data.facultativ) {
        setEnrollClientId(row.refId)
      } else {
        const name = [row.nume, row.prenume].filter(Boolean).join(' ')
        if (window.confirm(`${name} revine la grupă? Va fi marcat Prezent azi.`)) {
          toggleMut.mutate(row)
        }
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
      <div className="mb-5 flex items-center gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          ‹ Program
        </Button>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => navigate(`/cursuri/${cursId}`)}>
          Editează grupa
        </Button>
      </div>

      <div className="flex items-center gap-5 rounded-2xl bg-rail p-6 text-white">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-quasar-yellow font-display text-2xl font-bold text-ink">
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
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-quasar-yellow">
            Prezenți azi
          </div>
          <div className="fnum mt-1 font-display text-2xl font-bold">
            {present} <span className="text-base text-rail-soft">/ {enrolled}</span>
          </div>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-rail-2">
            <div
              className="h-full rounded-full bg-quasar-yellow"
              style={{ width: `${occPct}%` }}
            />
          </div>
        </div>
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
          </div>
          <div className="mb-3 text-xs text-muted">
            💡 Apasă pe un cursant pentru a marca prezent / absent
          </div>

          {data.roster.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
              Niciun cursant sau lead în roster.
            </p>
          ) : rosterView === 'list' ? (
            <RosterList
              rows={orderedRoster}
              onMemberClick={handleMemberClick}
              onPay={(id) => setPayClientId(id)}
              navigate={(to) => navigate(to)}
            />
          ) : rosterView === 'cols' ? (
            <RosterColumns rows={orderedRoster} onMemberClick={handleMemberClick} />
          ) : (
            <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {orderedRoster.map((r) => (
                <ClientCard
                  key={r.rowId}
                  row={r}
                  facultativ={data.facultativ}
                  onPay={(id) => setPayClientId(id)}
                  onTogglePrezenta={(row) => toggleMut.mutate(row)}
                  onReactivateRecurent={(row) => {
                    const name = [row.nume, row.prenume].filter(Boolean).join(' ')
                    if (
                      window.confirm(`${name} revine la grupă? Va fi marcat Prezent azi.`)
                    ) {
                      toggleMut.mutate(row)
                    }
                  }}
                  onReactivateFacultativ={(row) => setEnrollClientId(row.refId)}
                  togglePending={
                    toggleMut.isPending && toggleMut.variables?.rowId === r.rowId
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-dashed border-line px-[13px] py-[11px] text-sm font-semibold text-muted transition-colors hover:border-quasar-yellow hover:text-ink"
              >
                + Adaugă cursant
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'restantieri' && (
        <div className="mt-2">
          <RestantieriTab
            loading={restantieriQ.isLoading}
            rows={restantieriQ.data ?? []}
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
      {enrollClientId && (
        <EnrollmentForm
          open
          defaultClientId={enrollClientId}
          defaultCursId={cursId}
          onClose={() => {
            setEnrollClientId(null)
            void queryClient.invalidateQueries({
              queryKey: ['grupa-dashboard', cursId, date],
            })
          }}
        />
      )}
      {addOpen && (
        <EnrollmentForm
          open
          defaultCursId={cursId}
          onClose={() => {
            setAddOpen(false)
            void queryClient.invalidateQueries({
              queryKey: ['grupa-dashboard', cursId, date],
            })
          }}
        />
      )}
    </div>
  )
}
