import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, PageHeader, Select, Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { CursuriIncompleteSection } from './sections/CursuriIncompleteSection'

// Hub de igienă a datelor. Deocamdată o singură secțiune (cursuri); când apar
// teacherii/clienții, se adaugă o secțiune per entitate + un tab-bar deasupra.
export function FiseIncompletePage() {
  const { locatieId } = useWorkingLocatie()
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
        subtitle="Grupe cărora le lipsesc câmpuri esențiale sau recomandate"
      />

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
    </div>
  )
}
