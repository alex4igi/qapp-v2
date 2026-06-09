import { useState } from 'react'
import { PageHeader, Field, TextInput, Button, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isOwner } from '@/lib/rolesMatrix'
import { lunaCurenta } from './api'
import { ScorecardLeadsTab } from './ScorecardLeadsTab'
import { ScorecardRestanteTab } from './ScorecardRestanteTab'
import { ScorecardReactivariTab } from './ScorecardReactivariTab'
import { PraguriModal } from './PraguriModal'

const TABS = [
  { id: 'leads', label: 'Leads' },
  { id: 'restante', label: 'Restanțe' },
  { id: 'reactivari', label: 'Reactivări' },
]

export function ScorecardPage() {
  const { role } = useAuth()
  const [luna, setLuna] = useState(lunaCurenta())
  const [tab, setTab] = useState('leads')
  const [showPraguri, setShowPraguri] = useState(false)

  return (
    <div>
      <PageHeader
        title="Scorecard call-center"
        subtitle="Activitate per operator — Faza 1: leads · Faza 2: restanțe"
        actions={
          isOwner(role) ? (
            <Button variant="secondary" onClick={() => setShowPraguri(true)}>
              ⚙ Praguri
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field label="Luna" htmlFor="sc-luna">
            <TextInput
              id="sc-luna"
              type="month"
              value={luna}
              onChange={(e) => setLuna(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-quasar-gray">
        <span>📉 Sub-standard</span>
        <span>👌 Standard</span>
        <span>🚀 Peste-standard</span>
        <span>🚩 Rafală suspectă</span>
        <span>⚠️ Decalaj activitate↔rezultat</span>
      </div>

      {tab === 'leads' ? (
        <ScorecardLeadsTab luna={luna} />
      ) : tab === 'restante' ? (
        <ScorecardRestanteTab luna={luna} />
      ) : (
        <ScorecardReactivariTab luna={luna} />
      )}

      <PraguriModal open={showPraguri} onClose={() => setShowPraguri(false)} />
    </div>
  )
}
