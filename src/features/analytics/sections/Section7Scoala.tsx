import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getIncasariPerSezon } from '@/features/statistici/api'
import { IncasariSezonChart } from '@/features/statistici/IncasariSezonChart'
import { ANALYTICS_QO, SectionTitle, TotClubulBadge } from './shared'

export function Section7Scoala({ scoped = false }: { scoped?: boolean }) {
  const incasariSezonQ = useQuery({ queryKey: ['an', 'incasari-sezon'], queryFn: getIncasariPerSezon, ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle badge={scoped ? <TotClubulBadge /> : undefined} sub="Totalul încasărilor atribuite fiecărui sezon.">
        Încasări pe sezon
      </SectionTitle>
      {incasariSezonQ.isLoading ? <Spinner /> : <IncasariSezonChart rows={incasariSezonQ.data ?? []} />}
    </section>
  )
}
