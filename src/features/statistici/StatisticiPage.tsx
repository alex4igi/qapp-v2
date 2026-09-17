import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  PageHeader,
  Field,
  MonthPicker,
  Button,
  LazySection,
  Tabs,
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

const TABS = [
  { id: 'financiar',   label: 'Financiar' },
  { id: 'prezente',    label: 'Prezențe & ocupare' },
  { id: 'clienti',     label: 'Clienți & reînscrieri' },
  { id: 'leads',       label: 'Leads' },
  { id: 'instructori', label: 'Instructori' },
]

// Intervalul se arată doar pe taburile unde există secțiuni care ascultă de el;
// restul secțiunilor au fereastra lor fixă (azi / ultimele 12 luni / sezon țintă).
const TABS_CU_INTERVAL = new Set(['financiar', 'prezente', 'leads'])

// Pagina e un shell: fiecare secțiune își deține query-urile, iar tot ce e sub
// fold e în LazySection — la montare pleacă doar prima secțiune a tabului, nu
// întregul baraj de ~20 de requesturi (concurența degrada totul de 3-4x).
export function StatisticiPage() {
  const { role } = useAuth()
  const privileged = isPrivileged(role)
  const { locatieNume: scopLocatieNume } = useWorkingLocatie()
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())

  // Tabul stă în URL (?tab=) ca să reziste la refresh și să poată fi trimis ca link.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam! : 'financiar'
  const setTab = (id: string) =>
    setSearchParams(
      (prev) => {
        prev.set('tab', id)
        return prev
      },
      { replace: true },
    )

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t
      ? { fromLuna: t, toLuna: f }
      : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  return (
    <div>
      <PageHeader title="Statistici" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {TABS_CU_INTERVAL.has(tab) && (
        <div className="mb-6 flex flex-wrap items-end gap-3">
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
      )}

      {tab === 'financiar' && (
        <>
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
              <SectionMixIncasariCheltuieli interval={interval} />
            </LazySection>
          </div>
        </>
      )}

      {tab === 'prezente' && (
        <>
          <SectionPrezenteAchitare interval={interval} />
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
          </div>
        </>
      )}

      {tab === 'clienti' && (
        <div className="flex flex-col gap-8">
          {privileged && <SectionTotalClienti />}
          {privileged ? (
            <LazySection>
              <SectionReinscrieriSezoane />
            </LazySection>
          ) : (
            <SectionReinscrieriSezoane />
          )}
        </div>
      )}

      {tab === 'leads' && (
        <div className="flex flex-col gap-8">
          <SectionFunnelLeads interval={interval} />
          {privileged && (
            <LazySection minHeight={160}>
              <SectionConversieLeads />
            </LazySection>
          )}
        </div>
      )}

      {tab === 'instructori' && (
        <div className="flex flex-col gap-8">
          <TeacherOverviewSection />
          {isAdminOrHigher(role) && (
            <LazySection>
              <SectionProfitTeacheri />
            </LazySection>
          )}
        </div>
      )}
    </div>
  )
}
