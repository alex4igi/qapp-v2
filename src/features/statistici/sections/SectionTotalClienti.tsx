import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getCrestereNeta } from '@/features/ansamblu/api'
import { TotalClientiChart } from '@/features/ansamblu/TotalClientiChart'
import { STAT_QO } from './shared'

// Gate-ul de rol (privileged) e la montare, în StatisticiPage.
export function SectionTotalClienti() {
  const { locatieId: scopLocatie, locatieNume: scopLocatieNume } =
    useWorkingLocatie()

  const crestereQ = useQuery({
    queryKey: ['stat', 'crestere-neta', scopLocatie],
    queryFn: () => getCrestereNeta(scopLocatie, 12),
    ...STAT_QO,
  })

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Total clienți (ultimele 12 luni)
        </h2>
        <span className="text-xs text-quasar-gray">
          {scopLocatieNume ?? 'toate locațiile'}
        </span>
      </div>
      {crestereQ.isLoading ? (
        <Spinner />
      ) : (
        <TotalClientiChart rows={crestereQ.data ?? []} />
      )}
    </section>
  )
}
