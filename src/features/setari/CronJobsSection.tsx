import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'

type CronRun = {
  jobid: number
  jobname: string
  schedule: string
  command: string
  active: boolean
  runid: number | null
  status: string | null
  return_message: string | null
  start_time: string | null
  end_time: string | null
  duration_ms: number | null
}

const STATUS_CLS: Record<string, string> = {
  succeeded: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  running: 'bg-amber-100 text-amber-800',
}

async function getCronJobsRecent(): Promise<CronRun[]> {
  const { data, error } = await supabase.rpc('get_cron_jobs_recent', {
    p_days: 30,
  })
  if (error) throw error
  return (data ?? []) as CronRun[]
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ro-RO', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function CronJobsSection() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cron-jobs-recent'],
    queryFn: getCronJobsRecent,
  })

  // Grupare pe jobname pentru o listă curată
  const byJob = useMemo(() => {
    const map = new Map<string, { def: CronRun; runs: CronRun[] }>()
    for (const row of data ?? []) {
      const entry = map.get(row.jobname) ?? { def: row, runs: [] }
      if (row.runid) entry.runs.push(row)
      map.set(row.jobname, entry)
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
  }, [data])

  return (
    <section className="rounded-lg border border-quasar-gray-light bg-white p-5">
      <h2 className="mb-2 text-sm font-bold text-quasar-black">
        Cron jobs (pg_cron) — ultimele 30 zile
      </h2>
      <p className="mb-3 text-xs text-quasar-gray">
        Job-urile programate care rulează automat în baza de date. Util pentru
        a confirma că tranzițiile de sezon, anulările promo și digest-ul
        săptămânal funcționează.
      </p>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare: {error instanceof Error ? error.message : ''}
        </p>
      ) : byJob.length === 0 ? (
        <p className="text-sm text-quasar-gray">Niciun job programat.</p>
      ) : (
        <div className="space-y-3">
          {byJob.map(([jobname, { def, runs }]) => (
            <div
              key={jobname}
              className="rounded border border-quasar-gray-light"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-quasar-gray-light bg-quasar-gray-light/30 px-3 py-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm font-semibold text-quasar-black">
                    {jobname}
                  </span>
                  <span className="font-mono text-xs text-quasar-gray">
                    {def.schedule}
                  </span>
                  {!def.active && (
                    <span className="rounded bg-quasar-gray-light px-1.5 py-0.5 text-[10px] font-bold text-quasar-gray">
                      INACTIV
                    </span>
                  )}
                </div>
                <span className="text-xs text-quasar-gray">
                  {runs.length} rulări (30 zile)
                </span>
              </div>
              {runs.length === 0 ? (
                <p className="px-3 py-2 text-xs text-quasar-gray">
                  Nicio rulare în ultimele 30 zile.
                </p>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="text-quasar-gray">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">
                        Start
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium">
                        Durată
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium">
                        Mesaj
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 10).map((r) => (
                      <tr
                        key={r.runid ?? `${jobname}-no-run`}
                        className="border-t border-quasar-gray-light"
                      >
                        <td className="px-3 py-1.5 font-mono text-[11px]">
                          {formatDateTime(r.start_time)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              STATUS_CLS[r.status ?? ''] ??
                              'bg-quasar-gray-light text-quasar-gray'
                            }`}
                          >
                            {r.status ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          {formatDuration(r.duration_ms)}
                        </td>
                        <td className="max-w-md truncate px-3 py-1.5 text-quasar-gray">
                          {r.return_message ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
