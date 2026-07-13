import { useQuery } from '@tanstack/react-query'
import { formatDate } from '@/lib/format'
import { listReviews } from './api'

function StarsRow({ value }: { value: number }) {
  const full = Math.round(value)
  return (
    <span className="text-lg leading-none text-quasar-yellow" aria-hidden>
      {'★'.repeat(full)}
      <span className="text-quasar-gray/30">{'★'.repeat(5 - full)}</span>
    </span>
  )
}

type Props = { cursId?: string; evenimentId?: string }

// Media rating-urilor de la membri (din portal) pentru un curs sau eveniment + comentariile lor.
export function RatingSummary({ cursId, evenimentId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['reviews', { cursId, evenimentId }],
    queryFn: () => listReviews({ cursId, evenimentId }),
    enabled: Boolean(cursId || evenimentId),
  })

  const reviews = data ?? []
  const ratings = reviews
    .map((r) => r.rating)
    .filter((r): r is number => r != null)
  const avg = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null
  const comments = reviews.filter((r) => r.detalii?.trim())

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-display text-sm font-bold text-quasar-black">
        Rating membri
      </h2>

      {isLoading ? (
        <p className="text-sm text-quasar-gray">Se încarcă…</p>
      ) : avg == null ? (
        <p className="text-sm text-quasar-gray">Niciun rating încă.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <StarsRow value={avg} />
            <span className="text-2xl font-bold text-quasar-black">
              {avg.toFixed(1)}
            </span>
            <span className="text-sm text-quasar-gray">
              din {ratings.length}{' '}
              {ratings.length === 1 ? 'evaluare' : 'evaluări'}
            </span>
          </div>

          {comments.length > 0 && (
            <ul className="mt-4 space-y-3">
              {comments.map((r) => (
                <li
                  key={r.id}
                  className="border-t border-gray-100 pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-quasar-black">
                      {r.nume || 'Membru'}
                    </span>
                    <span className="whitespace-nowrap text-xs text-quasar-yellow">
                      {r.rating != null && (
                        <>
                          {'★'.repeat(r.rating)}
                          <span className="text-quasar-gray/30">
                            {'★'.repeat(5 - r.rating)}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-quasar-gray">{r.detalii}</p>
                  {r.created && (
                    <p className="mt-0.5 text-xs text-quasar-gray/70">
                      {formatDate(r.created)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
