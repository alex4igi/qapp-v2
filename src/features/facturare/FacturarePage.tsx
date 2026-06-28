import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { BancaTab } from './BancaTab'
import { PortalTab } from './PortalTab'

const TABS = [
  { id: 'banca', label: 'Transferuri bancare' },
  { id: 'portal', label: 'Plăți portal' },
]

export function FacturarePage() {
  const [tab, setTab] = useState('banca')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Facturare FGO"
        subtitle="Facturi din extrasul de cont și din plățile online — emise în FGO.ro"
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'banca' ? <BancaTab /> : <PortalTab />}
    </div>
  )
}
