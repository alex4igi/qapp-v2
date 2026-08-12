import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Button, type BadgeTone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { getCountdownTeacher, type CountdownGrupa } from '../flowApi'

type Props = {
  /** Restrânge la o singură grupă (bannerul din pagina grupei). */
  cursId?: string
  /** `card` = bloc de sine stătător; `inline` = fâșie subțire deasupra unei pagini. */
  variant?: 'card' | 'inline'
  className?: string
}

function tonZile(zile: number): BadgeTone {
  if (zile < 0) return 'danger'
  if (zile <= 7) return 'warn'
  return 'brand'
}

function textZile(zile: number): string {
  if (zile < 0) return 'Termenul a trecut'
  if (zile === 0) return 'Ultima zi'
  if (zile === 1) return 'Mai e o zi'
  return `Mai sunt ${zile} zile`
}

function ramase(g: CountdownGrupa): number {
  return Math.max(0, g.n_asteptati - g.n_completate)
}

/**
 * „Mai ai N zile și X cursanți de evaluat".
 *
 * Nu randează nimic dacă nu există rundă deschisă sau dacă instructorul n-are grupe
 * în ea — ca LectieBanner pe grupele fără program metodologic, feature-ul e invizibil
 * până devine relevant.
 */
export function EvaluariCountdown({ cursId, variant = 'card', className }: Props) {
  const { data } = useQuery({
    queryKey: ['evaluari', 'countdown'],
    queryFn: getCountdownTeacher,
    staleTime: 5 * 60 * 1000,
  })

  const grupe = (data ?? []).filter((g) => !cursId || g.curs_id === cursId)
  if (grupe.length === 0) return null

  const s = grupe[0]
  const totalRamase = grupe.reduce((n, g) => n + ramase(g), 0)
  const totalRespinse = grupe.reduce((n, g) => n + g.n_respinse, 0)

  // Nimic de făcut și nimic întors de manager → nu ocupăm spațiu pe ecran.
  if (totalRamase === 0 && totalRespinse === 0) {
    if (variant === 'inline') return null
    return (
      <section className={cn('rounded-2xl border border-line bg-card p-4', className)}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">✓ Evaluări complete</Badge>
          <span className="text-sm text-muted-2">
            {s.sesiune_nume} — ai terminat tot ce ți-a revenit.
          </span>
        </div>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-card p-4',
        variant === 'inline' && 'mb-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={tonZile(s.zile_ramase)}>{textZile(s.zile_ramase)}</Badge>
            <span className="text-xs font-medium text-muted">
              {s.sesiune_nume} — termen {formatDate(s.data_limita_teacher)}
            </span>
            {totalRespinse > 0 && (
              <Badge tone="danger">
                {totalRespinse} de corectat
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-ink">
            {totalRamase > 0
              ? `Mai ai ${totalRamase} ${totalRamase === 1 ? 'cursant' : 'cursanți'} de evaluat`
              : 'Ai evaluări întoarse de manager'}
          </p>

          {!cursId && grupe.length > 1 && (
            <ul className="mt-2 space-y-0.5">
              {grupe.map((g) => (
                <li key={g.curs_id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-2">{g.curs_nume}</span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      ramase(g) === 0 ? 'text-success' : 'text-ink',
                    )}
                  >
                    {g.n_completate}/{g.n_asteptati}
                  </span>
                  {g.n_respinse > 0 && (
                    <span className="text-danger">· {g.n_respinse} respinse</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cursId && (
            <p className="mt-1 text-xs text-muted-2">
              {s.n_completate} din {s.n_asteptati} completați
            </p>
          )}
        </div>

        <Link to={cursId ? `/evaluari/grupa/${cursId}` : '/evaluari'}>
          <Button variant="secondary">Completează →</Button>
        </Link>
      </div>
    </section>
  )
}
