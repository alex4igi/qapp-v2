import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getProfitabilitateTeacher } from '@/features/ansamblu/api'
import { TeacherMarjaTable } from '@/features/ansamblu/TeacherMarjaTable'
import { STAT_QO } from './shared'

// Gate-ul de rol (isAdminOrHigher) e la montare, în StatisticiPage.
export function SectionProfitTeacheri() {
  const profitQ = useQuery({
    queryKey: ['stat', 'profit-teacher'],
    queryFn: () => getProfitabilitateTeacher(12),
    ...STAT_QO,
  })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-quasar-black">
        Profitabilitate instructori (ultimele 12 luni)
      </h2>
      <p className="mb-3 text-xs text-quasar-gray">
        Încasări atribuite cursurilor instructorului minus salariu. Vizibil
        doar pentru owner și admin.
      </p>
      {profitQ.isLoading ? (
        <Spinner />
      ) : (
        <TeacherMarjaTable rows={profitQ.data ?? []} />
      )}
    </section>
  )
}
