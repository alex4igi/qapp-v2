import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Button, PageHeader, Spinner } from '@/components/ui'
import {
  calendarComplet,
  duplicaProgram,
  getCalendarSezon,
  getProgramDetaliat,
  stergeLectie,
  updateLectie,
  updateModul,
  updateProgram,
} from '../api'
import { ProgramSeasonView } from '../components/ProgramSeasonView'
import { StareToggle } from '../components/StareToggle'
import { LectieEditModal } from '../modals/LectieEditModal'
import { ModulEditModal } from '../modals/ModulEditModal'
import { ProgramNumeModal } from '../modals/ProgramNumeModal'
import type { LectieAfisata, ModulAfisat, StareProgram } from '../types'

export function ProgramEditorPage() {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lectie, setLectie] = useState<LectieAfisata | null>(null)
  const [modul, setModul] = useState<ModulAfisat | null>(null)
  const [editNume, setEditNume] = useState(false)
  const [duplicand, setDuplicand] = useState(false)
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
  const calendarGata = calendarComplet(calendarQuery.data ?? []).gata
  const eCiorna = program.stare === 'ciorna'

  const comutaStare = async (next: StareProgram) => {
    setEroareStare(null)
    try {
      await updateProgram(program.id, { stare: next })
      refresh()
    } catch (e) {
      setEroareStare(humanizeError(e))
    }
  }

  const duplica = async () => {
    setDuplicand(true)
    setEroareStare(null)
    try {
      const nouId = await duplicaProgram(program.id)
      qc.invalidateQueries({ queryKey: ['metodologic-progres', program.sezon_eticheta] })
      navigate(`/metodologic/${nouId}`)
    } catch (e) {
      setEroareStare(humanizeError(e))
    } finally {
      setDuplicand(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {program.nume}
            <button
              type="button"
              onClick={() => setEditNume(true)}
              aria-label="Editează numele programului"
              className="text-base text-muted hover:text-ink"
            >
              ✏️
            </button>
          </span>
        }
        subtitle={`${program.sezon_eticheta} · ${totalSedinte} ședințe · ${program.sedinte_pe_saptamana}×/săptămână`}
        actions={
          <>
            <Link to="/metodologic">
              <Button variant="ghost">← Metodologie</Button>
            </Link>
            <Button variant="secondary" onClick={duplica} disabled={duplicand}>
              {duplicand ? 'Se duplică…' : 'Duplică'}
            </Button>
            <StareToggle
              stare={program.stare as StareProgram}
              onChange={comutaStare}
              disabled={!calendarGata}
            />
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

      <ProgramNumeModal
        program={editNume ? program : null}
        onClose={() => setEditNume(false)}
        onSave={async (patch) => {
          await updateProgram(program.id, patch)
          refresh()
        }}
      />
    </div>
  )
}
