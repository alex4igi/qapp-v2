import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { listPraguri } from '@/features/scorecard/api'
import { useDeUrmarit, type GrupeSubMinimSumar } from '@/features/ansamblu/useDeUrmarit'
import { getAnalyticsSezon, getCursantiLunar } from './api'
import { ANALYTICS_QO } from './sections/shared'
import { SezonKpis } from './SezonKpis'
import { SchimbariLocatii } from './SchimbariLocatii'
import { CursantiSezonChart } from './CursantiSezonChart'
import { DetaliiInRevizuire } from './DetaliiInRevizuire'
import { dataScurta } from './comparatii'

// Lista operațională stă pe /overview; aici doar o numărăm, cu trimitere acolo.
// Restanțele lipsesc intenționat: le arată cardul, pe definiția ratelor depășite.
function RezumatOperational({ absente, grupe }: { absente: number | null; grupe: GrupeSubMinimSumar | null }) {
  const parti = [
    absente ? `${absente} absenți 21+ zile necontactați` : null,
    grupe && grupe.total > 0 ? `${grupe.total} grupe sub minimul sălii` : null,
  ].filter(Boolean)

  return (
    <Link
      to="/overview"
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-sm transition-colors hover:bg-rowhover"
    >
      <span className="min-w-0 truncate">
        <span className="text-muted-2">Lista de azi: </span>
        <span className="text-ink">{parti.length > 0 ? parti.join(' · ') : 'nimic de urmărit'}</span>
      </span>
      <span aria-hidden className="shrink-0 text-muted">
        Overview ›
      </span>
    </Link>
  )
}

export function AnalyticsPage() {
  const isMobile = useIsMobile()
  const { locatieId, locatieNume, ready } = useWorkingLocatie()

  const sezonQ = useQuery({
    queryKey: ['an', 'sezon', locatieId],
    queryFn: () => getAnalyticsSezon(locatieId),
    enabled: ready,
    ...ANALYTICS_QO,
  })
  const lunarQ = useQuery({
    queryKey: ['an', 'cursanti-lunar', locatieId],
    queryFn: () => getCursantiLunar(locatieId),
    enabled: ready && !isMobile,
    ...ANALYTICS_QO,
  })
  const praguriQ = useQuery({ queryKey: ['scorecard', 'praguri'], queryFn: listPraguri, ...ANALYTICS_QO })
  const { grupe, absente } = useDeUrmarit(locatieId, ready)

  const d = sezonQ.data?.selectie
  const scopLabel = locatieId ? (locatieNume ?? 'locația selectată') : 'tot clubul'

  return (
    <div>
      <PageHeader
        title={isMobile ? 'Cifre' : 'Panou — direcția sezonului'}
        subtitle={d ? `${scopLabel} · față de ${dataScurta(d.referinta)}` : scopLabel}
        actions={
          isMobile ? null : (
            <Link
              to="/"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-quasar-black transition-colors hover:bg-quasar-gray-light"
            >
              ← Operațional zi
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-4 lg:gap-6">
        {sezonQ.isLoading || !ready ? (
          <div className="flex min-h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : sezonQ.isError || !d ? (
          <p className="text-sm text-danger">Cifrele sezonului nu s-au putut încărca.</p>
        ) : (
          <SezonKpis d={d} grupe={grupe} praguri={praguriQ.data} />
        )}

        <RezumatOperational absente={absente} grupe={grupe} />

        {!isMobile && (
          <>
            {!locatieId && d && sezonQ.data?.locatii && (
              <SchimbariLocatii rows={sezonQ.data.locatii} referinta={d.referinta} />
            )}
            {lunarQ.isLoading ? (
              <div className="rounded-2xl border border-line bg-card p-5">
                <Spinner />
              </div>
            ) : (
              <CursantiSezonChart rows={lunarQ.data ?? []} />
            )}
            <DetaliiInRevizuire locatieId={locatieId} locatieNume={locatieNume} />
          </>
        )}
      </div>
    </div>
  )
}
