import { useMemo, useState } from 'react'
import {
  PageHeader,
  Field,
  MonthPicker,
  Button,
  LazySection,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isPrivileged, isAdminOrHigher } from '@/lib/rolesMatrix'
import { getSezonActiv, lunaCurenta, lunaCuOffset, type Interval } from './api'
import { TeacherOverviewSection } from './TeacherOverviewSection'
import { SectionKpiFinanciar } from './sections/SectionKpiFinanciar'
import { SectionBalantaLocatie } from './sections/SectionBalantaLocatie'
import { SectionBalantaCurs } from './sections/SectionBalantaCurs'
import { SectionBalantaTeacher } from './sections/SectionBalantaTeacher'
import { SectionPrezenteAchitare } from './sections/SectionPrezenteAchitare'
import { SectionFunnelLeads } from './sections/SectionFunnelLeads'
import { SectionMixIncasariCheltuieli } from './sections/SectionMixIncasariCheltuieli'
import { SectionReinscrieriSezoane } from './sections/SectionReinscrieriSezoane'
import { SectionTrendPrezente } from './sections/SectionTrendPrezente'
import { SectionOcupare } from './sections/SectionOcupare'
import { SectionTotalClienti } from './sections/SectionTotalClienti'
import { SectionConversieLeads } from './sections/SectionConversieLeads'
import { SectionProfitTeacheri } from './sections/SectionProfitTeacheri'

// Pagina e un shell: fiecare secțiune își deține query-urile, iar tot ce e sub
// fold e în LazySection — la montare pleacă doar KPI + Balanța locație, nu
// întregul baraj de ~20 de requesturi (concurența degrada totul de 3-4x).
export function StatisticiPage() {
  const { role } = useAuth()
  const privileged = isPrivileged(role)
  const { locatieNume: scopLocatieNume } = useWorkingLocatie()
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t
      ? { fromLuna: t, toLuna: f }
      : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  return (
    <div>
      <PageHeader
        title="Statistici"
        actions={
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Field label="De la luna" htmlFor="stat-from">
                <MonthPicker
                  id="stat-from"
                  value={fromLuna}
                  onChange={(v) => setFromLuna(v || lunaCuOffset(-11))}
                />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Până la luna" htmlFor="stat-to">
                <MonthPicker
                  id="stat-to"
                  value={toLuna}
                  onChange={(v) => setToLuna(v || lunaCurenta())}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const sezon = await getSezonActiv()
                if (sezon) {
                  setFromLuna(sezon.fromLuna)
                  setToLuna(sezon.toLuna)
                }
              }}
            >
              Sezon curent
            </Button>
          </div>
        }
      />

      <SectionKpiFinanciar interval={interval} />

      <div className="flex flex-col gap-4">
        <SectionBalantaLocatie interval={interval} />
        <LazySection>
          <SectionBalantaCurs interval={interval} />
        </LazySection>
        <LazySection>
          <SectionBalantaTeacher interval={interval} />
        </LazySection>
        <LazySection>
          <SectionPrezenteAchitare interval={interval} />
        </LazySection>
        <LazySection>
          <SectionFunnelLeads interval={interval} />
        </LazySection>
        <LazySection>
          <SectionMixIncasariCheltuieli interval={interval} />
        </LazySection>
        <LazySection>
          <SectionReinscrieriSezoane />
        </LazySection>
      </div>

      <div className="mt-8 flex flex-col gap-8 border-t border-quasar-gray-light pt-6">
        <h2 className="text-base font-bold text-quasar-black">
          Operațional — {scopLocatieNume ?? 'toate locațiile'}
        </h2>

        <LazySection>
          <SectionTrendPrezente />
        </LazySection>

        <LazySection>
          <SectionOcupare />
        </LazySection>

        <LazySection>
          <TeacherOverviewSection />
        </LazySection>

        {privileged && (
          <LazySection>
            <SectionTotalClienti />
          </LazySection>
        )}

        {privileged && (
          <LazySection minHeight={160}>
            <SectionConversieLeads />
          </LazySection>
        )}

        {isAdminOrHigher(role) && (
          <LazySection>
            <SectionProfitTeacheri />
          </LazySection>
        )}
      </div>
    </div>
  )
}
