import { PageHeader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/lib/rolesMatrix'
import { TarifePubliceSection } from './TarifePubliceSection'
import { ProdusePubliceSection } from './ProdusePubliceSection'
import { BiletePubliceSection } from './BiletePubliceSection'

// Oferta publică reflectată pe portalul de membri (/servicii): tarife + merchandise.
// Gestionată de manager în sus; restul staff-ului o vede read-only.
export function OfertaPublicaPage() {
  const { role } = useAuth()

  return (
    <div>
      <PageHeader
        title="Ofertă publică portal"
        subtitle={`Tarife și produse afișate pe portalul de membri — vedere ${ROLE_LABEL[role]}`}
      />
      <div className="space-y-8">
        <TarifePubliceSection />
        <ProdusePubliceSection />
        <BiletePubliceSection />
      </div>
    </div>
  )
}
