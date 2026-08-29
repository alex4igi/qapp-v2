import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, PageHeader, Select, Spinner, Tabs } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { CursuriIncompleteSection } from './sections/CursuriIncompleteSection'
import { TeacheriIncompleteSection } from './sections/TeacheriIncompleteSection'
import { ClientiIncompleteSection } from './sections/ClientiIncompleteSection'
import { FamiliiIncompleteSection } from './sections/FamiliiIncompleteSection'

// Hub de igienă a datelor: o secțiune per entitate. Filtrul de sezon e afișat
// doar pe tab-ul de grupe — un instructor nu aparține unui sezon, îl moștenește
// prin cursurile pe care le predă.
type Tab = 'cursuri' | 'teacheri' | 'clienti' | 'familii'

const TABS = [
  { id: 'cursuri', label: 'Grupe' },
  { id: 'teacheri', label: 'Instructori' },
  { id: 'clienti', label: 'Clienți activi' },
  { id: 'familii', label: 'Familii' },
]

export function FiseIncompletePage() {
  const { locatieId } = useWorkingLocatie()
  const [tab, setTab] = useState<Tab>('cursuri')
  const [sezonFilter, setSezonFilter] = useState('')
  const [sezonInit, setSezonInit] = useState(false)

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Default = sezonul activ; altfel pagina ar raporta și grupele sezoanelor vechi.
  useEffect(() => {
    if (!sezonInit && sezonActivQ.isSuccess) {
      setSezonFilter(sezonActivQ.data ?? '')
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.isSuccess, sezonActivQ.data])

  return (
    <div>
      <PageHeader
        title="Fișe incomplete"
        subtitle="Fișe cărora le lipsesc câmpuri esențiale sau recomandate"
      />

      <Tabs tabs={TABS} active={tab} onChange={(t) => setTab(t as Tab)} />

      {tab === 'cursuri' && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Field label="Sezon" htmlFor="fise-sezon">
                <Select
                  id="fise-sezon"
                  placeholder="Toate sezoanele"
                  options={sezoaneQ.data ?? []}
                  value={sezonFilter}
                  onChange={(e) => setSezonFilter(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {!sezonInit ? (
            <Spinner />
          ) : (
            <CursuriIncompleteSection
              sezonId={sezonFilter || null}
              locatieId={locatieId ?? null}
            />
          )}
        </>
      )}

      {tab === 'teacheri' && <TeacheriIncompleteSection />}
      {tab === 'clienti' && <ClientiIncompleteSection />}
      {tab === 'familii' && <FamiliiIncompleteSection />}
    </div>
  )
}
