import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Button, PageHeader, Spinner } from '@/components/ui'
import { DeleteConfirmModal } from '@/features/shared/DeleteConfirmModal'
import {
  adaugaLectie,
  duplicaProgram,
  getProgramDetaliat,
  stergeLectie,
  stergeProgram,
  updateLectie,
  updateModul,
  updateProgram,
} from '../api'
import { ProgramSeasonView } from '../components/ProgramSeasonView'
import { LectieEditModal } from '../modals/LectieEditModal'
import { ModulEditModal } from '../modals/ModulEditModal'
import { ProgramNumeModal } from '../modals/ProgramNumeModal'
import type { LectieAfisata, ModulAfisat } from '../types'

export function ProgramEditorPage() {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lectie, setLectie] = useState<LectieAfisata | null>(null)
  const [modul, setModul] = useState<ModulAfisat | null>(null)
  const [editNume, setEditNume] = useState(false)
  const [duplicand, setDuplicand] = useState(false)
  const [stergeOpen, setStergeOpen] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['program-detaliat', programId],
    queryFn: () => getProgramDetaliat(programId as string),
    enabled: Boolean(programId),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['program-detaliat', programId] })

  if (query.isLoading) return <Spinner />
  if (query.isError) {
    return <p className="text-sm text-danger">Eroare la încărcare: {humanizeError(query.error)}</p>
  }
  if (!query.data) return <p className="text-sm text-muted">Programul nu există.</p>

  const { program, totalSedinte } = query.data

  const duplica = async () => {
    setDuplicand(true)
    setEroare(null)
    try {
      const nouId = await duplicaProgram(program.id)
      qc.invalidateQueries({ queryKey: ['metodologic-progres', program.sezon_eticheta] })
      navigate(`/metodologic/${nouId}`)
    } catch (e) {
      setEroare(humanizeError(e))
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
            <Button variant="danger" onClick={() => setStergeOpen(true)}>
              Șterge
            </Button>
          </>
        }
      />

      {eroare && <p className="mb-4 text-sm text-danger">{eroare}</p>}

      <ProgramSeasonView
        detaliu={query.data}
        onEditLectie={setLectie}
        onEditModul={setModul}
        onAddLectie={async (m) => {
          await adaugaLectie(program.id, m.modul.id)
          refresh()
        }}
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

      <DeleteConfirmModal
        open={stergeOpen}
        title="Șterge programul"
        entityLabel={program.nume}
        noun="programul"
        onClose={() => setStergeOpen(false)}
        onConfirm={async (force) => {
          await stergeProgram(program.id, force)
          qc.invalidateQueries({ queryKey: ['metodologic-progres', program.sezon_eticheta] })
          navigate('/metodologic')
        }}
      />
    </div>
  )
}
