import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Select, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { listSezoane } from '@/features/setari/api'
import { getCampanieBySezon } from './api'
import { CampanieWizard } from './CampanieWizard'
import { CampanieBoard } from './components/CampanieBoard'
import { LegacyBoard } from './components/LegacyBoard'

export function ReinscrieriPage() {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canManage = isAdminOrHigher(role)
  const [sezonId, setSezonId] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  const sezoaneQ = useQuery({ queryKey: ['sezoane'], queryFn: listSezoane })

  const sezoaneOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (sezoaneQ.data ?? [])
      .filter(
        (s) =>
          s.tip === 'principal' &&
          s.stare === 'planificat' &&
          (!s.data_final || s.data_final >= today),
      )
      .map((s) => ({ value: s.id, label: s.numele_sezonului }))
  }, [sezoaneQ.data])

  useEffect(() => {
    if (!sezonId && sezoaneOptions.length > 0) {
      setSezonId(sezoaneOptions[0].value)
    }
  }, [sezonId, sezoaneOptions])

  const campanieQ = useQuery({
    queryKey: ['campanie-reinscriere', sezonId],
    enabled: Boolean(sezonId),
    queryFn: () => getCampanieBySezon(sezonId),
  })
  const campanie = campanieQ.data ?? null

  return (
    <div>
      <PageHeader
        title="Campania Reînscrieri"
        subtitle="Reînscrieri pentru sezonul de toamnă (sezon planificat)."
        actions={
          <div className="w-72">
            {sezoaneQ.isLoading ? (
              <Spinner />
            ) : sezoaneOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Nu există niciun sezon principal planificat.
              </p>
            ) : (
              <Select
                options={sezoaneOptions}
                value={sezonId}
                onChange={(e) => setSezonId(e.target.value)}
              />
            )}
          </div>
        }
      />

      {!sezonId ? (
        <p className="text-sm text-quasar-gray">Alege un sezon țintă.</p>
      ) : campanieQ.isLoading ? (
        <Spinner />
      ) : campanie ? (
        <CampanieBoard
          campanie={campanie}
          canManage={canManage}
          onChanged={() => {
            void queryClient.invalidateQueries({
              queryKey: ['campanie-reinscriere', sezonId],
            })
          }}
        />
      ) : (
        <LegacyBoard
          sezonId={sezonId}
          canManage={canManage}
          onCreateCampanie={() => setWizardOpen(true)}
        />
      )}

      {wizardOpen && (
        <CampanieWizard
          defaultSezonId={sezonId}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false)
            void queryClient.invalidateQueries({
              queryKey: ['campanie-reinscriere', sezonId],
            })
          }}
        />
      )}
    </div>
  )
}
