import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getLeadsPeLuna, type Interval } from '../api'
import { LeadsLunaChart } from '../LeadsLunaChart'
import { STAT_QO } from './shared'

export function SectionLeadsPeLuna({ interval }: { interval: Interval }) {
  const { locatieNume } = useWorkingLocatie()

  const leadsQ = useQuery({
    queryKey: ['stat', 'leads-luna', interval, locatieNume],
    queryFn: () => getLeadsPeLuna(interval, locatieNume),
    ...STAT_QO,
  })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-quasar-black">
        Leads pe lună — {locatieNume ?? 'toate locațiile'}
      </h2>
      <p className="mb-3 text-xs text-quasar-gray">
        Leadurile intrate în fiecare lună (fără Nurture) și câți dintre ei sunt azi convertiți.
      </p>
      {leadsQ.isLoading ? <Spinner /> : <LeadsLunaChart rows={leadsQ.data ?? []} />}
    </section>
  )
}
