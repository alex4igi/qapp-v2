import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Badge, Button, PageHeader, Spinner } from '@/components/ui'
import {
  calendarComplet,
  getCalendarSezon,
  getProgramDetaliat,
  stergeLectie,
  updateLectie,
  updateModul,
  updateProgram,
} from '../api'
import { ProgramSeasonView } from '../components/ProgramSeasonView'
import { LectieEditModal } from '../modals/LectieEditModal'
import { ModulEditModal } from '../modals/ModulEditModal'
import type { LectieAfisata, ModulAfisat, SursaProgram } from '../types'

export function ProgramEditorPage() {
  const { programId } = useParams<{ programId: string }>()
  const qc = useQueryClient()
  const [lectie, setLectie] = useState<LectieAfisata | null>(null)
  const [modul, setModul] = useState<ModulAfisat | null>(null)
  const [eroareStare, setEroareStare] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['program-detaliat', programId],
    queryFn: () => getProgramDetaliat(programId as string),
    enabled: Boolean(programId),
  })

  const calendarQuery = useQuery({
    queryKey: ['metodologic-calendar', query.data?.program.sezon_eticheta],
    queryFn: () => getCalendarSezon(query.data!.program.sezon_eticheta),
    enabled: Boolean(query.data),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['program-detaliat', programId] })

  if (query.isLoading) return <Spinner />
  if (query.isError) {
    return <p className="text-sm text-danger">Eroare la încărcare: {humanizeError(query.error)}</p>
  }
  if (!query.data) return <p className="text-sm text-muted">Programul nu există.</p>

  const { program, totalSedinte } = query.data
  const surse = (program.surse as SursaProgram[] | null) ?? []
  const calendarGata = calendarComplet(calendarQuery.data ?? []).gata
  const eCiorna = program.stare === 'ciorna'

  const comutaStare = async () => {
    setEroareStare(null)
    try {
      await updateProgram(program.id, { stare: eCiorna ? 'activ' : 'ciorna' })
      refresh()
    } catch (e) {
      setEroareStare(humanizeError(e))
    }
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {program.nume}
            <Badge tone={eCiorna ? 'warn' : 'success'}>{eCiorna ? 'ciornă' : 'activ'}</Badge>
          </span>
        }
        subtitle={`${program.sezon_eticheta} · ${totalSedinte} ședințe · ${program.sedinte_pe_saptamana}×/săptămână`}
        actions={
          <>
            <Link to="/metodologic">
              <Button variant="ghost">← Metodologie</Button>
            </Link>
            <Button onClick={comutaStare} disabled={eCiorna && !calendarGata}>
              {eCiorna ? 'Activează programul' : 'Trece în ciornă'}
            </Button>
          </>
        }
      />

      {eCiorna && !calendarGata && (
        <p className="mb-4 rounded-lg bg-warn-bg px-3 py-3 text-sm text-warn">
          📅 Programul nu poate fi activat: sezonul {program.sezon_eticheta} n-are module cu
          date în calendar.
        </p>
      )}
      {eroareStare && <p className="mb-4 text-sm text-danger">{eroareStare}</p>}

      {surse.length > 0 && (
        <p className="mb-4 text-xs text-muted">
          Import din: {surse.map((s) => `${s.grupa} (${s.zile})`).join(' · ')}
        </p>
      )}

      <ProgramSeasonView
        detaliu={query.data}
        onEditLectie={setLectie}
        onEditModul={setModul}
      />

      <LectieEditModal
        lectie={lectie}
        onClose={() => setLectie(null)}
        onSave={async (patch) => {
          await updateLectie(lectie!.id, patch)
          refresh()
        }}
        onDelete={async () => {
          await stergeLectie(program.id, lectie!.id, lectie!.nr_sedinta)
          setLectie(null)
          refresh()
        }}
      />

      <ModulEditModal
        modul={modul}
        onClose={() => setModul(null)}
        onSave={async (patch) => {
          await updateModul(modul!.modul.id, patch)
          refresh()
        }}
      />
    </div>
  )
}
