import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import { RaportZileTab } from './RaportZileTab'
import { CashTab } from './CashTab'
import { CheltuieliTab } from './CheltuieliTab'

export function FinanciarPage() {
  const { role } = useAuth()
  // Front_desk vede doar rapoartele operaționale (raportul pe zile, reconcilierea
  // cash — munca lor). Lista încasărilor e în pagina Plăți, restanțele în /datorii
  // (vederea „Pe rate"). Tabul Cheltuieli rămâne manager+.
  const privileged = isPrivileged(role)
  const tabs = privileged
    ? [
        { id: 'raport',       label: 'Raport pe zile' },
        { id: 'cheltuieli',   label: 'Cheltuieli' },
        { id: 'cash',         label: 'Cash' },
      ]
    : [
        { id: 'raport',       label: 'Raport pe zile' },
        { id: 'cash',         label: 'Cash' },
      ]
  const [active, setActive] = useState('raport')

  return (
    <div>
      <PageHeader title="Financiar" />
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      {active === 'raport' && <RaportZileTab privileged={privileged} />}
      {active === 'cheltuieli' && privileged && <CheltuieliTab />}
      {active === 'cash' && <CashTab />}
    </div>
  )
}
