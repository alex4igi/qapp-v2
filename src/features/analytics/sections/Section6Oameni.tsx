import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getInstructoriClientiTrend } from '../api'
import { InstructoriTrendCard } from '../InstructoriTrendCard'
import { ANALYTICS_QO, SectionTitle, TotClubulBadge } from './shared'

export function Section6Oameni({ scoped = false }: { scoped?: boolean }) {
  const instructoriQ = useQuery({ queryKey: ['an', 'instructori'], queryFn: () => getInstructoriClientiTrend(6), ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle
        badge={scoped ? <TotClubulBadge /> : undefined}
        sub="Cursanți prezenți pe lunile încheiate. Iulie–august apar goale: la vară toate grupele sunt facultative."
      >
        Instructori
      </SectionTitle>
      <h3 className="mb-2 text-sm font-semibold text-quasar-black">Clienți per instructor + câștigă/pierde</h3>
      {instructoriQ.isLoading ? <Spinner /> : <InstructoriTrendCard rows={instructoriQ.data ?? []} />}
    </section>
  )
}
