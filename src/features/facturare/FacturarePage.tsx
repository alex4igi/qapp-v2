import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { BancaTab } from './BancaTab'
import { PortalTab } from './PortalTab'
import { ClientiTab } from './ClientiTab'
import { RaportNetopiaTab } from './RaportNetopiaTab'
import { FACTURARE_LA_CERERE_ENABLED } from './flags'

export function FacturarePage() {
  const { role } = useAuth()
  const tabs = [
    { id: 'banca', label: 'Transferuri bancare' },
    { id: 'portal', label: 'Plăți portal' },
    ...(FACTURARE_LA_CERERE_ENABLED ? [{ id: 'clienti', label: 'Clienți (la cerere)' }] : []),
    ...(isAdminOrHigher(role) ? [{ id: 'netopia', label: 'Raport Netopia' }] : []),
  ]

  // ?tab= în URL: notificarea lunară deschide direct raportul.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabs.some((t) => t.id === tabParam) ? tabParam! : 'banca'
  const setTab = (id: string) =>
    setSearchParams(
      (prev) => {
        prev.set('tab', id)
        return prev
      },
      { replace: true },
    )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Facturare FGO"
        subtitle="Facturi din extrasul de cont și din plățile online — emise în FGO.ro"
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'banca' ? (
        <BancaTab />
      ) : tab === 'portal' ? (
        <PortalTab />
      ) : tab === 'netopia' ? (
        <RaportNetopiaTab />
      ) : (
        <ClientiTab />
      )}
    </div>
  )
}
