import { Link } from 'react-router-dom'
import { PageHeader, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isOwner, ROLE_LABEL } from '@/lib/rolesMatrix'
import { SaliSection } from './SaliSection'
import { SezoaneSection } from './SezoaneSection'
import { UtilizatoriSection } from './UtilizatoriSection'
import { SmsQuietHoursSection } from './SmsQuietHoursSection'

export function SetariPage() {
  const { role } = useAuth()

  return (
    <div>
      <PageHeader
        title="Setări"
        subtitle={`Săli, sezoane, utilizatori — vedere ${ROLE_LABEL[role]}`}
        actions={
          isOwner(role) ? (
            <Link to="/organizatie">
              <Button variant="secondary">Organizație →</Button>
            </Link>
          ) : null
        }
      />
      <div className="space-y-8">
        <SaliSection />
        <SezoaneSection />
        <SmsQuietHoursSection />
        <UtilizatoriSection />
      </div>
    </div>
  )
}
