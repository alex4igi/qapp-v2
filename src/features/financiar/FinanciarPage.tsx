import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import { RestanteTab } from './RestanteTab'
import { RaportZileTab } from './RaportZileTab'
import { CashTab } from './CashTab'
import { CheltuieliTab } from './CheltuieliTab'

export function FinanciarPage() {
  const { role } = useAuth()
  // Front_desk vede doar rapoartele operaționale (restanțe, reconciliere cash —
  // munca lor). Lista încasărilor e în pagina Plăți. Tab-urile cu cheltuieli/profit
  // (Raport pe zile = net, Cheltuieli, Evoluție lunară) rămân manager+.
  const privileged = isPrivileged(role)
  const tabs = privileged
    ? [
        { id: 'raport',       label: 'Raport pe zile' },
        { id: 'cheltuieli',   label: 'Cheltuieli' },
        { id: 'restante',     label: 'Restanțe' },
        { id: 'cash',         label: 'Cash' },
      ]
    : [
        { id: 'raport',       label: 'Raport pe zile' },
        { id: 'restante',     label: 'Restanțe' },
        { id: 'cash',         label: 'Cash' },
      ]
  const [active, setActive] = useState('raport')

  return (
    <div>
      <PageHeader title="Financiar" />
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      {active === 'raport' && <RaportZileTab privileged={privileged} />}
      {active === 'cheltuieli' && privileged && <CheltuieliTab />}
      {active === 'restante' && <RestanteTab />}
      {active === 'cash' && <CashTab />}
    </div>
  )
}
