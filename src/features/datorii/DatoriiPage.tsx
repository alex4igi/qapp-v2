import { useState } from 'react'
import { Button, LazySection, PageHeader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { PraguriModal } from '@/features/scorecard/PraguriModal'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { LogRecuperareModal, type RecuperareTarget } from './LogRecuperareModal'
import type { WorklistRow } from './api'
import { SectionKpi } from './sections/SectionKpi'
import { SectionColectareDonut } from './sections/SectionColectareDonut'
import { SectionAging } from './sections/SectionAging'
import { SectionEvolutie } from './sections/SectionEvolutie'
import { SectionRecuperareActiva } from './sections/SectionRecuperareActiva'
import { SectionComparativLocatii } from './sections/SectionComparativLocatii'
import { SectionPromisiuni } from './sections/SectionPromisiuni'
import { SectionWorklist } from './sections/SectionWorklist'

// Hub-ul de datorii: KPI + semafor pe definiția canonică, grafice de colectare,
// promisiuni de plată și worklist-ul de sunat (fostul /recuperare, absorbit).
// Scopul de locație vine EXCLUSIV din selectorul 📍 global (front_desk cu
// locație fixă e blocat pe ea; manager+ poate comuta pe „Toate locațiile").
// Pagina e un shell: fiecare secțiune își deține query-urile; sub fold totul e
// în LazySection (pattern /statistici).
export function DatoriiPage() {
  const { role } = useAuth()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [praguriOpen, setPraguriOpen] = useState(false)
  const [target, setTarget] = useState<RecuperareTarget | null>(null)
  const [plataClientId, setPlataClientId] = useState<string | null>(null)

  const onLog = (r: WorklistRow) =>
    setTarget({
      clientId: r.client_id,
      nume: `${r.nume} ${r.prenume ?? ''}`.trim(),
      rest: r.rest_total,
    })
  const onPlata = (r: WorklistRow) => setPlataClientId(r.client_id)

  return (
    <div>
      <PageHeader
        title="Datorii"
        subtitle={`Recuperare și evoluție restanțe — ${locatieNume ?? 'toate locațiile'}`}
        actions={
          isAdminOrHigher(role) ? (
            <Button variant="secondary" onClick={() => setPraguriOpen(true)}>
              ⚙ Praguri
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <SectionKpi locatieId={locatieId} />

        <LazySection minHeight={320}>
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionColectareDonut locatieId={locatieId} />
            <SectionAging locatieId={locatieId} />
          </div>
        </LazySection>

        <LazySection minHeight={340}>
          <SectionEvolutie locatieId={locatieId} />
        </LazySection>

        <LazySection minHeight={220}>
          <SectionRecuperareActiva locatieId={locatieId} />
        </LazySection>

        {locatieId === null && (
          <LazySection minHeight={260}>
            <SectionComparativLocatii />
          </LazySection>
        )}

        <LazySection minHeight={180}>
          <SectionPromisiuni locatieId={locatieId} onLog={onLog} />
        </LazySection>

        <SectionWorklist locatieId={locatieId} onLog={onLog} onPlata={onPlata} />
      </div>

      {target && (
        <LogRecuperareModal open target={target} onClose={() => setTarget(null)} />
      )}
      {plataClientId && (
        <PlataNouaModal
          open
          defaultClientId={plataClientId}
          onClose={() => setPlataClientId(null)}
        />
      )}
      <PraguriModal open={praguriOpen} onClose={() => setPraguriOpen(false)} />
    </div>
  )
}
