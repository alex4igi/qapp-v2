import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Field, Select } from '@/components/ui'
import { getProgrameActive, sugereazaProgram } from '../api'

type Props = {
  /** Eticheta text a sezonului („2026-2027") — programele sunt ancorate pe ea. */
  sezonEticheta: string | null
  nivelul: string | null
  varsta: string | null
  zile: string[]
  value: string
  onChange: (programId: string) => void
  /** Aplică automat sugestia când câmpul e gol (util la curs nou). */
  autoSugestie?: boolean
}

/**
 * Alegerea programului metodologic pentru un curs.
 *
 * Listează doar programele ACTIVE ale sezonului — trigger-ul din DB refuză oricum
 * asocierea unei ciorne, iar o listă care conține opțiuni respinse la salvare ar fi
 * o capcană.
 */
export function ProgramPicker({
  sezonEticheta,
  nivelul,
  varsta,
  zile,
  value,
  onChange,
  autoSugestie = false,
}: Props) {
  const { data: programe = [], isLoading } = useQuery({
    queryKey: ['programe-active', sezonEticheta],
    queryFn: () => getProgrameActive(sezonEticheta as string),
    enabled: Boolean(sezonEticheta),
  })

  const sugestie = useMemo(
    () => sugereazaProgram({ nivelul, varsta, zile }, programe),
    [nivelul, varsta, zile, programe]
  )

  useEffect(() => {
    if (autoSugestie && !value && sugestie) onChange(sugestie.id)
  }, [autoSugestie, value, sugestie, onChange])

  if (!sezonEticheta) {
    return (
      <Field label="Program metodologic">
        <p className="text-sm text-muted">Alege întâi sezonul.</p>
      </Field>
    )
  }

  if (!isLoading && programe.length === 0) {
    return (
      <Field label="Program metodologic">
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          Niciun program activ pentru {sezonEticheta}.{' '}
          <Link to="/metodologic" className="font-medium underline">
            Configurează metodologia
          </Link>
          .
        </p>
      </Field>
    )
  }

  return (
    <Field label="Program metodologic" htmlFor="program-metodologic">
      <Select
        id="program-metodologic"
        placeholder="— fără program —"
        options={programe.map((p) => ({ value: p.id, label: p.nume }))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {sugestie && sugestie.id !== value && (
        <button
          type="button"
          onClick={() => onChange(sugestie.id)}
          className="mt-1 text-xs text-muted underline hover:text-ink"
        >
          Sugerat: {sugestie.nume} — aplică
        </button>
      )}
    </Field>
  )
}
