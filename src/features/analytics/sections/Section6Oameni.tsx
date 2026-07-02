import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getProfitabilitateTeacher } from '@/features/ansamblu/api'
import { TeacherMarjaTable } from '@/features/ansamblu/TeacherMarjaTable'
import { getInstructoriClientiTrend } from '../api'
import { InstructoriTrendCard } from '../InstructoriTrendCard'
import { ANALYTICS_QO, SectionTitle, TotClubulBadge } from './shared'

export function Section6Oameni({ scoped = false }: { scoped?: boolean }) {
  const instructoriQ = useQuery({ queryKey: ['an', 'instructori'], queryFn: () => getInstructoriClientiTrend(6), ...ANALYTICS_QO })
  const profitQ = useQuery({ queryKey: ['an', 'profit-teacher'], queryFn: () => getProfitabilitateTeacher(12), ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle
        badge={scoped ? <TotClubulBadge /> : undefined}
        sub="Cel mai subevaluat KPI dintr-o școală de dans: care instructori țin copiii."
      >
        6 · Oameni — instructori
      </SectionTitle>
      <h3 className="mb-2 text-sm font-semibold text-quasar-black">Clienți per instructor + câștigă/pierde</h3>
      {instructoriQ.isLoading ? <Spinner /> : <InstructoriTrendCard rows={instructoriQ.data ?? []} />}
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-quasar-black">Profitabilitate instructori (12 luni)</h3>
        {profitQ.isLoading ? <Spinner /> : <TeacherMarjaTable rows={profitQ.data ?? []} />}
      </div>
    </section>
  )
}
