import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Lead } from '@/types/db'
import { InteresBadge, GrupaBadge, SursaBadge, SubStatusBadge } from './Badges'
import { isToday } from './constants'
import { timpRelativ } from './LeadHistory'

type Props = {
  lead: Lead
  onClick: (lead: Lead) => void
  campaniiById: Map<string, string>
  isDragging?: boolean
}

function calcAge(dataNasterii: string | null): number | null {
  if (!dataNasterii) return null
  const dob = new Date(dataNasterii)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  )
    age--
  return age
}

const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${MONTHS[d.getMonth()]}, ${h}:${m}`
}

export function LeadCard({ lead, onClick, campaniiById, isDragging }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  const fullName =
    [lead.prenume, lead.nume].filter(Boolean).join(' ') || lead.nume
  const age = calcAge(lead.data_nasterii)
  const sursaNume = lead.sursa ? (campaniiById.get(lead.sursa) ?? null) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      suppressHydrationWarning
      className={`group cursor-grab rounded-lg border border-quasar-gray-light bg-white p-2.5 transition-colors hover:border-quasar-yellow active:cursor-grabbing ${
        isDragging ? 'shadow-xl' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2" {...listeners}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {lead.flag_reminder && (
              <svg
                className="h-3 w-3 shrink-0 text-red-500"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M5 3v18l7-4 7 4V3H5z" />
              </svg>
            )}
            <p className="truncate text-sm font-medium text-quasar-black">
              {fullName}
            </p>
            {age !== null && (
              <span
                className="shrink-0 text-xs text-quasar-gray"
                suppressHydrationWarning
              >
                {age} ani
              </span>
            )}
            {isToday(lead.created) && (
              <span
                className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                suppressHydrationWarning
              >
                Azi
              </span>
            )}
          </div>
          {lead.nume_parinte && (
            <p className="mt-0.5 text-xs text-quasar-gray">
              👤 {lead.nume_parinte}
            </p>
          )}
          {lead.telefon && (
            <p className="mt-0.5 text-xs text-quasar-gray">{lead.telefon}</p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClick(lead)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-1 text-quasar-gray opacity-0 transition-colors group-hover:opacity-100 hover:bg-quasar-gray-light hover:text-quasar-black"
          title="Editează"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      </div>

      <div
        className="mt-2 flex flex-wrap gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        {...listeners}
      >
        {lead.interes && <InteresBadge interes={lead.interes} />}
        {lead.grupa_varsta && <GrupaBadge grupa={lead.grupa_varsta} />}
        {sursaNume && <SursaBadge sursa={sursaNume} />}
        {lead.sub_status && <SubStatusBadge subStatus={lead.sub_status} />}
      </div>

      {lead.locatia && (
        <div className="mt-2 flex items-center gap-1" {...listeners}>
          <span className="text-xs text-quasar-gray">📍 {lead.locatia}</span>
        </div>
      )}

      {lead.data_programare && (
        <div className="mt-1.5 flex items-center gap-1" {...listeners}>
          <span
            className="text-xs font-medium text-amber-700"
            suppressHydrationWarning
          >
            🗓 {formatDate(lead.data_programare)}
          </span>
        </div>
      )}

      {lead.status === 'pierdut' && lead.motiv_pierdut && (
        <div
          className="mt-2 border-t border-quasar-gray-light pt-2"
          {...listeners}
        >
          <p className="line-clamp-2 text-xs italic text-quasar-gray">
            "{lead.motiv_pierdut}"
          </p>
        </div>
      )}

      <p
        className="mt-1.5 text-[10px] text-quasar-gray"
        suppressHydrationWarning
        {...listeners}
      >
        Ultima acțiune: {timpRelativ(lead.updated)}
      </p>
    </div>
  )
}
