import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getGradOcupare } from '@/features/ansamblu/api'
import { OcupareList } from '@/features/ansamblu/OcupareList'
import { STAT_QO } from './shared'

export function SectionOcupare() {
  const { locatieId: scopLocatie } = useWorkingLocatie()

  const ocupareQ = useQuery({
    queryKey: ['stat', 'ocupare', scopLocatie],
    queryFn: () => getGradOcupare(scopLocatie),
    ...STAT_QO,
  })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-quasar-black">
        Grad de ocupare cursuri
      </h2>
      <p className="mb-3 text-xs text-quasar-gray">
        Înscriși activi luna asta / capacitate.{' '}
        <span className="text-green-700">verde</span> bine ocupat ·{' '}
        <span className="text-amber-600">galben</span> loc disponibil ·{' '}
        <span className="text-red-600">roșu</span> peste capacitate.
      </p>
      {ocupareQ.isLoading ? (
        <Spinner />
      ) : (
        <OcupareList rows={ocupareQ.data ?? []} />
      )}
    </section>
  )
}
