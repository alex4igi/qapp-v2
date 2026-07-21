import { Fragment, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { Lead } from '@/types/db'
import type { PipelineColumn } from './constants'
import { isToday } from './constants'
import { LeadCard } from './LeadCard'
import { exportLeadsCsv } from './leadExport'

const PAGE_SIZE = 30
// Lead-urile convertite mai vechi de 30 de zile se arhivează (ascunse din coloană).
const ARCHIVE_MS = 30 * 86_400_000

type Props = {
  column: PipelineColumn
  leads: Lead[]
  campaniiById: Map<string, string>
  collapsed?: boolean
  onToggleCollapse?: () => void
  onLeadClick: (lead: Lead) => void
  onAddLead: (status: string) => void
  onLogContact: (lead: Lead) => void
  onEnroll: (lead: Lead) => void
  enrolledClientIds: Set<string>
}

const ts = (iso: string) => new Date(iso).getTime()

// Reguli de ordonare per coloană:
//  - 'nou': lead-urile de azi sus (cronologic descrescător), apoi delimitator,
//    apoi cele mai vechi (flag-uite primele). Un lead de azi nu poate fi
//    flag-uit (flagul se pune abia la >24h).
//  - 'waiting_list': FIFO (cele mai vechi sus).
//  - rest: flag_reminder sus; în 'contactat' sub_status coboară jos.
function sortLeads(leads: Lead[], status: string): Lead[] {
  return [...leads].sort((a, b) => {
    if (status === 'nou') {
      const aT = isToday(a.created) ? 0 : 1
      const bT = isToday(b.created) ? 0 : 1
      if (aT !== bT) return aT - bT
      const aF = a.flag_reminder ? 0 : 1
      const bF = b.flag_reminder ? 0 : 1
      if (aF !== bF) return aF - bF
      return ts(b.created) - ts(a.created)
    }
    if (status === 'waiting_list') return ts(a.created) - ts(b.created)

    if (status === 'contactat') {
      const now = Date.now()
      // Follow-up scadent (data a trecut) → capul coloanei, imediat ce se
      // declanșează, fără să aștepte flag-ul de seară al cron-ului.
      const due = (l: Lead) =>
        l.sub_status && l.data_callback_dorit && ts(l.data_callback_dorit) <= now
          ? 0
          : 1
      const aDue = due(a)
      const bDue = due(b)
      if (aDue !== bDue) return aDue - bDue
      // Ambele scadente: cel mai demult scadent primul.
      if (aDue === 0)
        return ts(a.data_callback_dorit!) - ts(b.data_callback_dorit!)
      // Niciunul scadent: flag sus, apoi contacte proaspete (fără sub-status),
      // apoi follow-up apropiat.
      const aFlag = a.flag_reminder ? 0 : 1
      const bFlag = b.flag_reminder ? 0 : 1
      if (aFlag !== bFlag) return aFlag - bFlag
      const aSub = a.sub_status ? 1 : 0
      const bSub = b.sub_status ? 1 : 0
      if (aSub !== bSub) return aSub - bSub
      if (a.sub_status && b.sub_status) {
        const aCb = a.data_callback_dorit ? ts(a.data_callback_dorit) : Infinity
        const bCb = b.data_callback_dorit ? ts(b.data_callback_dorit) : Infinity
        return aCb - bCb
      }
      return 0
    }

    const aFlag = a.flag_reminder ? 0 : 1
    const bFlag = b.flag_reminder ? 0 : 1
    if (aFlag !== bFlag) return aFlag - bFlag
    return 0
  })
}

export function KanbanColumn({
  column,
  leads,
  campaniiById,
  collapsed = false,
  onToggleCollapse,
  onLeadClick,
  onAddLead,
  onLogContact,
  onEnroll,
  enrolledClientIds,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status })
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [showArchived, setShowArchived] = useState(false)

  // Pliată: bandă îngustă, dar TOT droppable — altfel „trage în Convertit" ar
  // înceta să funcționeze exact pentru coloanele pe care le pliem.
  if (collapsed) {
    return (
      <button
        type="button"
        ref={setNodeRef}
        onClick={onToggleCollapse}
        title={`${column.label} (${leads.length}) — click pentru a desface`}
        className={`flex w-10 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl py-2.5 transition-all ${column.header} ${
          isOver ? 'w-24 ring-2 ring-quasar-yellow' : 'opacity-80 hover:opacity-100'
        }`}
      >
        <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs font-medium text-white">
          {leads.length}
        </span>
        <span
          className="text-sm font-semibold whitespace-nowrap text-white"
          style={{ writingMode: 'vertical-rl' }}
        >
          {column.label}
        </span>
      </button>
    )
  }

  // Coloana 'convertit': lead-urile cu data_conversie > 3 luni sunt arhivate.
  const isArchived = (l: Lead) =>
    column.status === 'convertit' &&
    Boolean(l.data_conversie) &&
    Date.now() - ts(l.data_conversie as string) > ARCHIVE_MS
  const archivedCount =
    column.status === 'convertit' ? leads.filter(isArchived).length : 0
  const shownLeads =
    column.status === 'convertit' && !showArchived
      ? leads.filter((l) => !isArchived(l))
      : leads

  const sorted = sortLeads(shownLeads, column.status)
  const visible = sorted.slice(0, visibleCount)
  const remaining = sorted.length - visibleCount

  // În coloana 'nou' — index-ul primului lead mai vechi de azi (delimitator).
  const dividerIndex =
    column.status === 'nou'
      ? visible.findIndex((l) => !isToday(l.created))
      : -1

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div
        className={`flex items-center justify-between rounded-t-xl px-3 py-2.5 ${column.header}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {column.label}
          </span>
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs font-medium text-white">
            {leads.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              title={`Pliază ${column.label}`}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          {column.status === 'nurture' && leads.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportLeadsCsv(leads, campaniiById, 'nurture-leads.csv')
              }
              className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              title="Exportă CSV (lead-urile filtrate)"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => onAddLead(column.status)}
            className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title={`Adaugă lead în ${column.label}`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[120px] space-y-2 rounded-b-xl border border-t-0 border-gray-200 p-2 transition-colors ${
          isOver
            ? 'border-dashed border-quasar-yellow bg-quasar-yellow/10'
            : 'bg-gray-50'
        }`}
      >
        <SortableContext
          items={visible.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {visible.map((lead, i) => (
            <Fragment key={lead.id}>
              {i === dividerIndex && dividerIndex > 0 && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="h-px flex-1 bg-quasar-gray-light" />
                  <span className="text-[10px] uppercase tracking-wide text-quasar-gray">
                    mai vechi de azi
                  </span>
                  <span className="h-px flex-1 bg-quasar-gray-light" />
                </div>
              )}
              <LeadCard
                lead={lead}
                campaniiById={campaniiById}
                onClick={onLeadClick}
                onLogContact={onLogContact}
                onEnroll={onEnroll}
                isEnrolled={
                  lead.id_client
                    ? enrolledClientIds.has(lead.id_client)
                    : false
                }
              />
            </Fragment>
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex h-20 items-center justify-center">
            <p className="text-xs text-quasar-gray">Niciun lead</p>
          </div>
        )}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="mt-1 w-full rounded-lg border border-dashed border-quasar-gray-light py-1.5 text-xs text-quasar-gray transition-colors hover:border-quasar-gray hover:text-quasar-black"
          >
            + {remaining} mai multe
          </button>
        )}

        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mt-1 w-full rounded-lg border border-dashed border-quasar-gray-light py-1.5 text-xs text-quasar-gray transition-colors hover:border-quasar-gray hover:text-quasar-black"
          >
            {showArchived
              ? 'Ascunde arhivate'
              : `Arată arhivate (${archivedCount})`}
          </button>
        )}
      </div>
    </div>
  )
}
