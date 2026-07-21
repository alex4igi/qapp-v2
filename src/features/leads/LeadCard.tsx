import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import type { Lead } from '@/types/db'
import { waLink } from '@/lib/phone'
import { InteresBadge, SubStatusBadge } from './Badges'
import { GRUPA_LABELS, isToday, waLeadMessage } from './constants'

type Props = {
  lead: Lead
  onClick: (lead: Lead) => void
  campaniiById: Map<string, string>
  onLogContact?: (lead: Lead) => void
  onEnroll?: (lead: Lead) => void
  isEnrolled?: boolean
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
  return `${day} ${MONTHS[d.getMonth()]}`
}

export function LeadCard({
  lead,
  onClick,
  campaniiById,
  onLogContact,
  onEnroll,
  isEnrolled,
  isDragging,
}: Props) {
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
  // Colapsate sub „+N", cu detaliul în tooltip.
  const secundare = [
    lead.grupa_varsta ? GRUPA_LABELS[lead.grupa_varsta] : null,
    sursaNume,
    lead.locatia ? `📍 ${lead.locatia}` : null,
  ].filter(Boolean) as string[]
  // Client creat (din conversie) dar înrolarea nu e finalizată → lead-ul nu e
  // încă „convertit". Oferim reluarea direct de pe card.
  const needsEnrollment =
    Boolean(onEnroll) &&
    Boolean(lead.id_client) &&
    lead.status !== 'convertit' &&
    !isEnrolled
  // Lead contactat cu sub-status (de_revenit / nu_raspunde): pe card arătăm doar
  // data de follow-up, nu data programării (care n-are sens pentru ele).
  const isContactatSubStatus =
    lead.status === 'contactat' && Boolean(lead.sub_status)
  const followupOverdue =
    isContactatSubStatus &&
    Boolean(lead.data_callback_dorit) &&
    new Date(lead.data_callback_dorit!).getTime() < Date.now()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      suppressHydrationWarning
      className={`group cursor-grab rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm transition-all hover:border-quasar-yellow hover:shadow-md active:cursor-grabbing ${
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
        <div className="flex shrink-0 items-center gap-0.5">
          {waLink(lead.telefon) && (
            <a
              href={waLink(lead.telefon, waLeadMessage(lead))!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-quasar-gray opacity-60 transition-colors group-hover:opacity-100 hover:bg-green-50 hover:text-green-600"
              title="Scrie pe WhatsApp"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51l-.57-.01c-.197 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.064 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.57-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
          )}
          {onLogContact && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onLogContact(lead)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-quasar-gray opacity-60 transition-colors group-hover:opacity-100 hover:bg-quasar-gray-light hover:text-quasar-black"
              title="Loghează contact"
            >
              📞
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClick(lead)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-1 text-quasar-gray opacity-60 transition-colors group-hover:opacity-100 hover:bg-quasar-gray-light hover:text-quasar-black"
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
      </div>

      <div
        className="mt-2 flex flex-wrap gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        {...listeners}
      >
        {lead.deja_client &&
          (lead.id_client ? (
            <Link
              to={`/clienti/${lead.id_client}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex items-center rounded-full bg-quasar-yellow px-2 py-0.5 text-xs font-semibold text-quasar-black hover:underline"
              title="Deja client — deschide fișa"
            >
              ⭐ DEJA CLIENT
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-full bg-quasar-yellow px-2 py-0.5 text-xs font-semibold text-quasar-black">
              ⭐ DEJA CLIENT
            </span>
          ))}
        {/* Doar semnalele care schimbă decizia la telefon. Restul (sursă, grupă,
            locație) sunt în tooltip și în fișă — cardul trebuie scanat, nu citit. */}
        {lead.sub_status && <SubStatusBadge subStatus={lead.sub_status} />}
        {(lead.nr_neprezentari ?? 0) >= 1 && (
          <span
            className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
            title={`${lead.nr_neprezentari} neprezentări`}
          >
            ❌ {lead.nr_neprezentari}
          </span>
        )}
        {lead.interes && <InteresBadge interes={lead.interes} />}
        {secundare.length > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
            title={secundare.join(' · ')}
          >
            +{secundare.length}
          </span>
        )}
      </div>

      {isContactatSubStatus
        ? lead.data_callback_dorit && (
            <div className="mt-1.5 flex items-center gap-1" {...listeners}>
              <span
                className={`text-xs font-medium ${
                  followupOverdue ? 'text-red-600' : 'text-amber-700'
                }`}
                suppressHydrationWarning
              >
                📞 {formatDate(lead.data_callback_dorit)}
                {followupOverdue && ' (scadent)'}
              </span>
            </div>
          )
        : lead.data_programare && (
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

      {needsEnrollment && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEnroll!(lead)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 w-full rounded-lg bg-quasar-yellow px-2 py-1.5 text-xs font-semibold text-quasar-black transition-colors hover:brightness-95"
          title="Deschide formularul de înrolare pentru acest lead"
        >
          ▸ Finalizează înscrierea
        </button>
      )}

      {/* „Ultima acțiune" a fost scoasă de pe card: măsura orice update al
          rândului, nu un contact real, iar vederea Listă are coloana „Ultim
          contact" care chiar înseamnă ceva. Rămâne în tooltipul numelui. */}
    </div>
  )
}
