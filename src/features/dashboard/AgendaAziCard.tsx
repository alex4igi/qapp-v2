import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listLeads } from '@/features/leads/api'
import { groupTodayLeads } from '@/features/leads/TodayPanel'

// Rezumatul „de azi" pentru recepție: adună într-un singur loc lead-urile care
// cer acțiune azi (reutilizează groupTodayLeads din /leads). Restanțele de sunat
// sunt în cardul separat DatorniciWorklistCard de pe același Dashboard.
export function AgendaAziCard() {
  const leadsQ = useQuery({ queryKey: ['leads'], queryFn: listLeads })
  const groups = useMemo(
    () => groupTodayLeads(leadsQ.data ?? []),
    [leadsQ.data],
  )

  const items: Array<{ label: string; n: number; cls: string }> = [
    { label: '⚑ Marcate pentru revenire', n: groups.reminders.length, cls: 'text-red-700' },
    { label: '📅 Programați azi la demo', n: groups.programatiAzi.length, cls: 'text-blue-700' },
    { label: '📞 Callback scadent', n: groups.callbacks.length, cls: 'text-orange-700' },
    { label: '🕐 Noi, necontactate >24h', n: groups.staleNew.length, cls: 'text-zinc-700' },
    { label: '⏳ Fără follow-up >7 zile', n: groups.noFollowup.length, cls: 'text-amber-700' },
    { label: '💤 Inactive >30 zile', n: groups.inactive.length, cls: 'text-slate-600' },
  ]
  const total = items.reduce((a, b) => a + b.n, 0)

  return (
    <div className="mb-6 rounded-lg border border-quasar-gray-light bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-quasar-black">
          ⚡ De lucrat azi (lead-uri){total > 0 ? ` — ${total}` : ''}
        </h2>
        <Link
          to="/leads"
          className="text-xs font-semibold text-quasar-yellow-dark hover:underline"
        >
          Deschide în Leads →
        </Link>
      </div>

      {leadsQ.isLoading ? (
        <p className="text-sm text-quasar-gray">Se încarcă…</p>
      ) : total === 0 ? (
        <p className="text-sm text-quasar-gray">
          Nimic urgent în lead-uri azi. 🎉
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
          {items
            .filter((it) => it.n > 0)
            .map((it) => (
              <li
                key={it.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-quasar-black">{it.label}</span>
                <strong className={it.cls}>{it.n}</strong>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
