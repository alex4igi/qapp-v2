import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getLeadHistory, type LeadHistoryEntry } from './api'
import { STATUS_CONFIG, SUB_STATUS_OPTIONS } from './constants'

function statusLabel(v: string | null): string {
  if (!v) return '—'
  return STATUS_CONFIG[v as keyof typeof STATUS_CONFIG]?.label ?? v
}

function subStatusLabel(v: string | null): string {
  if (!v) return '—'
  return SUB_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
}

export function timpRelativ(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'chiar acum'
  if (min < 60) return `acum ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `acum ${h} ${h === 1 ? 'oră' : 'ore'}`
  const z = Math.floor(h / 24)
  if (z < 30) return `acum ${z} ${z === 1 ? 'zi' : 'zile'}`
  const l = Math.floor(z / 30)
  return `acum ${l} ${l === 1 ? 'lună' : 'luni'}`
}

function describe(e: LeadHistoryEntry): { icon: string; text: string } {
  switch (e.action_type) {
    case 'created':
      return { icon: '📋', text: 'Lead creat' }
    case 'status_change':
      return {
        icon: '➡️',
        text: `Status: ${statusLabel(e.old_value)} → ${statusLabel(e.new_value)}`,
      }
    case 'sub_status_change':
      return {
        icon: '🔄',
        text: `Sub-status: ${subStatusLabel(e.old_value)} → ${subStatusLabel(e.new_value)}`,
      }
    case 'flag_set':
      return { icon: '⚑', text: 'Marcat pentru revenire' }
    case 'flag_cleared':
      return { icon: '✓', text: 'Marcaj de revenire eliminat' }
    case 'note_added':
      return { icon: '📝', text: 'Observații actualizate' }
    case 'sms_sent':
      return { icon: '✉️', text: 'SMS trimis' }
    case 'field_edit':
      return { icon: '✏️', text: 'Date actualizate' }
    case 'assigned':
      return { icon: '👤', text: 'Responsabil schimbat' }
    default:
      return { icon: '•', text: e.action_type }
  }
}

export function LeadHistory({ leadId }: { leadId: string }) {
  const q = useQuery({
    queryKey: ['lead-history', leadId],
    queryFn: () => getLeadHistory(leadId),
  })

  if (q.isLoading) return <Spinner />
  if (q.isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea istoricului.
      </p>
    )

  const entries = q.data ?? []
  if (!entries.length)
    return (
      <p className="text-sm text-quasar-gray">
        Niciun eveniment înregistrat încă.
      </p>
    )

  return (
    <ul className="space-y-2.5">
      {entries.map((e) => {
        const d = describe(e)
        return (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 leading-5">{d.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-quasar-black">{d.text}</p>
              <p className="text-xs text-quasar-gray">
                {timpRelativ(e.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
