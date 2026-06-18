import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import { IncasariTab } from './IncasariTab'
import { RestanteTab } from './RestanteTab'
import { RaportZileTab } from './RaportZileTab'
import { EvolutieLunaraTab } from './EvolutieLunaraTab'
import { ReconcilieriTab } from './ReconcilieriTab'
import { CheltuieliTab } from './CheltuieliTab'

export function FinanciarPage() {
  const { role } = useAuth()
  // Front_desk vede doar rapoartele operaționale (încasări, restanțe,
  // reconciliere cash — munca lor). Tab-urile cu cheltuieli/profit
  // (Raport pe zile = net, Cheltuieli, Evoluție lunară) rămân manager+.
  const privileged = isPrivileged(role)
  const tabs = privileged
    ? [
        { id: 'raport',       label: 'Raport pe zile' },
        { id: 'incasari',     label: 'Încasări' },
        { id: 'cheltuieli',   label: 'Cheltuieli' },
        { id: 'restante',     label: 'Restanțe' },
        { id: 'evolutie',     label: 'Evoluție lunară' },
        { id: 'reconcilieri', label: 'Reconcilieri cash' },
      ]
    : [
        { id: 'incasari',     label: 'Încasări' },
        { id: 'restante',     label: 'Restanțe' },
        { id: 'reconcilieri', label: 'Reconcilieri cash' },
      ]
  const [active, setActive] = useState(privileged ? 'raport' : 'incasari')

  return (
    <div>
      <PageHeader title="Financiar" />
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      {active === 'raport' && privileged && <RaportZileTab />}
      {active === 'incasari' && <IncasariTab />}
      {active === 'cheltuieli' && privileged && <CheltuieliTab />}
      {active === 'restante' && <RestanteTab />}
      {active === 'evolutie' && privileged && <EvolutieLunaraTab />}
      {active === 'reconcilieri' && <ReconcilieriTab />}
    </div>
  )
}
