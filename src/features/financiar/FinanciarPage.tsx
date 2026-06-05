import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { IncasariTab } from './IncasariTab'
import { RestanteTab } from './RestanteTab'
import { RaportZileTab } from './RaportZileTab'
import { EvolutieLunaraTab } from './EvolutieLunaraTab'
import { ReconcilieriTab } from './ReconcilieriTab'
import { CheltuieliTab } from './CheltuieliTab'

const tabs = [
  { id: 'raport',        label: 'Raport pe zile' },
  { id: 'incasari',      label: 'Încasări' },
  { id: 'cheltuieli',    label: 'Cheltuieli' },
  { id: 'restante',      label: 'Restanțe' },
  { id: 'evolutie',      label: 'Evoluție lunară' },
  { id: 'reconcilieri',  label: 'Reconcilieri cash' },
]

export function FinanciarPage() {
  const [active, setActive] = useState('raport')

  return (
    <div>
      <PageHeader title="Financiar" />
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      {active === 'raport' && <RaportZileTab />}
      {active === 'incasari' && <IncasariTab />}
      {active === 'cheltuieli' && <CheltuieliTab />}
      {active === 'restante' && <RestanteTab />}
      {active === 'evolutie' && <EvolutieLunaraTab />}
      {active === 'reconcilieri' && <ReconcilieriTab />}
    </div>
  )
}
