import { useMemo, useState } from 'react'
import type { Lead, StatusLead } from '@/types/db'
import { InteresBadge } from './Badges'
import { FOLLOWUP_DAYS, INACTIVE_DAYS } from './constants'
import { timpRelativ } from './LeadHistory'

type Props = {
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  onLogContact?: (lead: Lead) => void
}

type TodayGroups = {
  reminders: Lead[]
  programatiAzi: Lead[]
  callbacks: Lead[]
  staleNew: Lead[]
  noFollowup: Lead[]
  inactive: Lead[]
}

const TERMINAL: StatusLead[] = ['convertit', 'pierdut']
const DAY = 24 * 60 * 60 * 1000
// Pipeline activ pentru listele de neglijență (exclude stările „parcate":
// programat are demo, waiting_list/nurture sunt intenționat în așteptare).
const ACTIVE_PIPELINE: StatusLead[] = ['nou', 'contactat']
// Praguri escaladare (contactat dar cald 7–30z → „fără follow-up"; >30z →
// „inactiv") — definite în constants.ts, partajate cu coloana „Ultim contact".

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

// Un lead apare o singură dată, în primul grup care îl prinde.
export function groupTodayLeads(leads: Lead[], now = new Date()): TodayGroups {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const cutoff24h = now.getTime() - DAY
  const cutoffFollowup = now.getTime() - FOLLOWUP_DAYS * DAY
  const cutoffInactive = now.getTime() - INACTIVE_DAYS * DAY
  const reminders: Lead[] = []
  const programatiAzi: Lead[] = []
  const callbacks: Lead[] = []
  const staleNew: Lead[] = []
  const noFollowup: Lead[] = []
  const inactive: Lead[] = []
  for (const l of leads) {
    if (TERMINAL.includes(l.status)) continue
    // Lead marcat „deja client" nu intră în call-list-ul de lucru.
    if (l.deja_client) continue
    if (l.flag_reminder) {
      reminders.push(l)
      continue
    }
    if (
      l.status === 'programat' &&
      l.data_programare &&
      isSameDay(new Date(l.data_programare), now)
    ) {
      programatiAzi.push(l)
      continue
    }
    if (l.data_callback_dorit && new Date(l.data_callback_dorit) <= endOfToday) {
      callbacks.push(l)
      continue
    }
    if (
      l.status === 'nou' &&
      new Date(l.created).getTime() < cutoff24h &&
      !l.nr_contactari &&
      !l.ultima_contactare_la
    ) {
      staleNew.push(l)
      continue
    }
    // Listele de neglijență: doar pipeline activ, fără callback viitor programat
    // (cele scadente sunt deja în `callbacks`). Ultima activitate = ultimul
    // contact sau, dacă n-a fost contactat, data intrării.
    if (ACTIVE_PIPELINE.includes(l.status) && !l.data_callback_dorit) {
      const lastActivity = new Date(
        l.ultima_contactare_la ?? l.created,
      ).getTime()
      if (lastActivity < cutoffInactive) {
        inactive.push(l)
      } else if (l.ultima_contactare_la && lastActivity < cutoffFollowup) {
        noFollowup.push(l)
      }
    }
  }
  programatiAzi.sort((a, b) =>
    (a.data_programare ?? '').localeCompare(b.data_programare ?? ''),
  )
  callbacks.sort((a, b) =>
    (a.data_callback_dorit ?? '').localeCompare(b.data_callback_dorit ?? ''),
  )
  staleNew.sort((a, b) => a.created.localeCompare(b.created))
  const byLastActivity = (a: Lead, b: Lead) =>
    (a.ultima_contactare_la ?? a.created).localeCompare(
      b.ultima_contactare_la ?? b.created,
    )
  noFollowup.sort(byLastActivity)
  inactive.sort(byLastActivity)
  return { reminders, programatiAzi, callbacks, staleNew, noFollowup, inactive }
}

function formatOra(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatCallback(iso: string): { text: string; overdue: boolean } {
  const d = new Date(iso)
  const now = new Date()
  const overdue = d.getTime() < now.getTime()
  const sameDay = d.toDateString() === now.toDateString()
  const ora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return {
    text: sameDay ? `azi ${ora}` : `${d.getDate()}.${d.getMonth() + 1} ${ora}`,
    overdue,
  }
}

function Row({
  lead,
  extra,
  onLeadClick,
  onLogContact,
}: {
  lead: Lead
  extra: React.ReactNode
  onLeadClick: (l: Lead) => void
  onLogContact?: (l: Lead) => void
}) {
  const fullName =
    [lead.prenume, lead.nume].filter(Boolean).join(' ') || lead.nume
  return (
    <div
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-quasar-gray-light/50"
      onClick={() => onLeadClick(lead)}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-quasar-black">
        {fullName}
      </span>
      {lead.telefon && (
        <span className="shrink-0 text-xs text-quasar-gray">
          {lead.telefon}
        </span>
      )}
      {lead.interes && <InteresBadge interes={lead.interes} />}
      <span className="shrink-0 text-xs">{extra}</span>
      {onLogContact && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onLogContact(lead)
        }}
        className="shrink-0 rounded p-1 text-quasar-gray transition-colors hover:bg-quasar-gray-light hover:text-quasar-black"
        title="Loghează contact"
      >
        📞
      </button>
      )}
    </div>
  )
}

// Câte rânduri arătăm per grup înainte de „arată toate" (importul v1 a lăsat
// sute de lead-uri „nou" — panoul nu trebuie să devină un zid).
const GROUP_CAP = 10

function Group({
  title,
  leads,
  extraOf,
  onLeadClick,
  onLogContact,
}: {
  title: string
  leads: Lead[]
  extraOf: (l: Lead) => React.ReactNode
  onLeadClick: (l: Lead) => void
  onLogContact?: (l: Lead) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (!leads.length) return null
  const visible = showAll ? leads : leads.slice(0, GROUP_CAP)
  return (
    <div>
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
        {title} ({leads.length})
      </p>
      <div className="space-y-0.5">
        {visible.map((l) => (
          <Row
            key={l.id}
            lead={l}
            extra={extraOf(l)}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
        ))}
      </div>
      {leads.length > GROUP_CAP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 px-2 text-xs font-medium text-quasar-gray hover:text-quasar-black"
        >
          {showAll ? '▲ Arată mai puține' : `+ ${leads.length - GROUP_CAP} mai multe`}
        </button>
      )}
    </div>
  )
}

// Panoul „De lucrat azi" — adună lead-urile care cer acțiune: flag ⚑ pus de
// cron-evening, callback-uri scadente și lead-uri noi necontactate >24h.
// Iese singur din listă: flag-ul se șterge la drag, callback-ul la logare
// contact, „nou" la prima contactare.
export function TodayPanel({ leads, onLeadClick, onLogContact }: Props) {
  const [expanded, setExpanded] = useState(false)
  const groups = useMemo(() => groupTodayLeads(leads), [leads])
  const total =
    groups.reminders.length +
    groups.programatiAzi.length +
    groups.callbacks.length +
    groups.staleNew.length +
    groups.noFollowup.length +
    groups.inactive.length

  if (!total) return null

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-quasar-black">
          ⚡ De lucrat azi — {total} {total === 1 ? 'lead' : 'lead-uri'}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-quasar-gray">
          {groups.reminders.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
              ⚑ {groups.reminders.length}
            </span>
          )}
          {groups.programatiAzi.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
              📅 {groups.programatiAzi.length}
            </span>
          )}
          {groups.callbacks.length > 0 && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
              📞 {groups.callbacks.length}
            </span>
          )}
          {groups.staleNew.length > 0 && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-zinc-700">
              🕐 {groups.staleNew.length}
            </span>
          )}
          {groups.noFollowup.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
              ⏳ {groups.noFollowup.length}
            </span>
          )}
          {groups.inactive.length > 0 && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
              💤 {groups.inactive.length}
            </span>
          )}
        </span>
        <span className="ml-auto text-xs text-quasar-gray">
          {expanded ? '▲ Ascunde' : '▼ Arată'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-amber-200 px-1 py-2">
          <Group
            title="Marcate pentru revenire"
            leads={groups.reminders}
            extraOf={(l) => (
              <span className="text-red-600">⚑ {timpRelativ(l.updated)}</span>
            )}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
          <Group
            title="Programați azi la demo"
            leads={groups.programatiAzi}
            extraOf={(l) => (
              <span className="text-blue-600">
                {l.data_programare ? `azi ${formatOra(l.data_programare)}` : 'azi'}
              </span>
            )}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
          <Group
            title="Callback scadent"
            leads={groups.callbacks}
            extraOf={(l) => {
              const c = formatCallback(l.data_callback_dorit!)
              return (
                <span className={c.overdue ? 'text-red-600' : 'text-orange-600'}>
                  {c.text}
                </span>
              )
            }}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
          <Group
            title="Noi, necontactate >24h"
            leads={groups.staleNew}
            extraOf={(l) => (
              <span className="text-quasar-gray">
                intrat {timpRelativ(l.created)}
              </span>
            )}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
          <Group
            title="Fără follow-up >7 zile"
            leads={groups.noFollowup}
            extraOf={(l) => (
              <span className="text-amber-600">
                contact {timpRelativ(l.ultima_contactare_la ?? l.created)}
              </span>
            )}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
          <Group
            title="Inactive >30 zile"
            leads={groups.inactive}
            extraOf={(l) => (
              <span className="text-slate-500">
                {timpRelativ(l.ultima_contactare_la ?? l.created)}
              </span>
            )}
            onLeadClick={onLeadClick}
            onLogContact={onLogContact}
          />
        </div>
      )}
    </div>
  )
}
