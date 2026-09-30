import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import {
  getMixMetode,
  getMixCategoriiIncasari,
  getMixCategoriiCheltuieli,
  getMixRecurentOneoff,
  type Interval,
} from '../api'
import { MetodePlataChart } from '../MetodePlataChart'
import { OverviewDonut } from '../OverviewDonut'
import { CategorieChart } from '../CategorieChart'
import { STAT_QO } from './shared'

const CATEG_INCASARI_PALETTE: Record<string, string> = {
  Abonament:  '#10b981',
  Bilet:      '#3b82f6',
  Merch:      '#ffd600',
  Taxa:       '#a855f7',
  Workshop:   '#ec4899',
  Auditie:    '#14b8a6',
  Inchiriere: '#f97316',
  Necunoscut: '#9ca3af',
}

const CATEG_CHELTUIELI_PALETTE: Record<string, string> = {
  Administrativa: '#f59e0b',
  Salariala:      '#ef4444',
  Alta:           '#6366f1',
  Necunoscut:     '#9ca3af',
}

export function SectionMixIncasariCheltuieli({ interval }: { interval: Interval }) {
  const { role } = useAuth()
  // Secțiunea se montează pentru toți; doar coloana de cheltuieli e gated.
  const privileged = isPrivileged(role)

  const recurentQ = useQuery({
    queryKey: ['stat', 'recurent-oneoff', interval],
    queryFn: () => getMixRecurentOneoff(interval),
    ...STAT_QO,
  })

  const recurent = useMemo(() => {
    const rows = recurentQ.data ?? []
    const rec = rows.find((r) => r.tip === 'Recurent')?.total ?? 0
    const oneoff = rows.find((r) => r.tip === 'One-off')?.total ?? 0
    const tot = rec + oneoff
    return { rec, oneoff, pct: tot > 0 ? Math.round((100 * rec) / tot) : 0 }
  }, [recurentQ.data])

  const metodeQ = useQuery({
    queryKey: ['stat', 'mix-metode', interval],
    queryFn: () => getMixMetode(interval),
    ...STAT_QO,
  })

  const categIncQ = useQuery({
    queryKey: ['stat', 'categ-incasari', interval],
    queryFn: () => getMixCategoriiIncasari(interval),
    ...STAT_QO,
  })

  const categChelQ = useQuery({
    queryKey: ['stat', 'categ-cheltuieli', interval],
    queryFn: () => getMixCategoriiCheltuieli(interval),
    enabled: privileged,
    ...STAT_QO,
  })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {recurentQ.isLoading ? (
        <Spinner />
      ) : (
        <OverviewDonut
          title="Recurent vs one-off"
          percent={recurent.pct}
          centerSub="recurent"
          slices={[
            { name: 'Recurent', value: recurent.rec },
            { name: 'One-off', value: recurent.oneoff },
          ]}
          colors={['#10b981', '#f59e0b']}
        />
      )}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-quasar-black">
          Mix metode de plată
        </h2>
        {metodeQ.isLoading ? (
          <Spinner />
        ) : (
          <MetodePlataChart rows={metodeQ.data ?? []} />
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-quasar-black">
          Încasări pe categorie
        </h2>
        {categIncQ.isLoading ? (
          <Spinner />
        ) : (
          <CategorieChart
            title="Distribuție încasări"
            rows={categIncQ.data ?? []}
            palette={CATEG_INCASARI_PALETTE}
          />
        )}
      </div>
      {privileged && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
            Cheltuieli pe categorie
          </h2>
          {categChelQ.isLoading ? (
            <Spinner />
          ) : (
            <CategorieChart
              title="Distribuție cheltuieli"
              rows={categChelQ.data ?? []}
              palette={CATEG_CHELTUIELI_PALETTE}
            />
          )}
        </div>
      )}
    </div>
  )
}
