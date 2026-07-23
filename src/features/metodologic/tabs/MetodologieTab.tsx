import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Spinner } from '@/components/ui'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { getProgramDetaliat, setOverride } from '../api'
import { ProgramSeasonView } from '../components/ProgramSeasonView'
import { OverrideModal } from '../modals/OverrideModal'
import type { LectieAfisata } from '../types'

type Props = {
  cursId: string
  programId: string | null
  /** Poate adapta lecțiile (teacher pe grupa lui sau management). Serverul confirmă via RLS. */
  canEdit: boolean
  /** Poate lega un program (management). */
  canLink: boolean
}

/** Tab „Metodologie" în fișa cursului: programul sezonului cu adaptările grupei. */
export function MetodologieTab({ cursId, programId, canEdit, canLink }: Props) {
  const qc = useQueryClient()
  const { teacherId } = useCurrentTeacherId()
  const [lectie, setLectie] = useState<LectieAfisata | null>(null)

  const query = useQuery({
    queryKey: ['program-detaliat', programId, cursId],
    queryFn: () => getProgramDetaliat(programId as string, cursId),
    enabled: Boolean(programId),
  })

  if (!programId) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-card p-6 text-center">
        <p className="text-sm text-muted">
          Grupa nu are un program metodologic asociat.
        </p>
        {canLink && (
          <p className="mt-2 text-sm">
            Alege unul din <span className="font-medium text-ink">Editează grupa</span> sau
            configurează structura în{' '}
            <Link to="/metodologic" className="font-medium text-ink underline">
              Metodologie
            </Link>
            .
          </p>
        )}
      </div>
    )
  }

  if (query.isLoading) return <Spinner />
  if (query.isError) {
    return (
      <p className="mt-4 text-sm text-danger">
        Eroare la încărcare: {humanizeError(query.error)}
      </p>
    )
  }
  if (!query.data) return <p className="mt-4 text-sm text-muted">Programul nu există.</p>

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-muted">
        {query.data.program.nume} · {query.data.totalSedinte} ședințe.{' '}
        {canEdit && 'Apasă o lecție ca s-o adaptezi pentru grupa ta.'}
      </p>
      <ProgramSeasonView
        detaliu={query.data}
        onEditLectie={canEdit ? setLectie : undefined}
      />
      <OverrideModal
        lectie={lectie}
        onClose={() => setLectie(null)}
        onSave={async (patch) => {
          await setOverride(cursId, lectie!.nr_sedinta, patch, teacherId)
          qc.invalidateQueries({ queryKey: ['program-detaliat', programId, cursId] })
        }}
      />
    </div>
  )
}
