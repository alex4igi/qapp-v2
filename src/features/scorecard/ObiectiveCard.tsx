import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import {
  getConversiiCount,
  listObiective,
  upsertObiectiv,
  type ObiectivMetric,
  type ScorecardRow,
} from './api'

type Props = {
  luna: string
  locatie: string | null
  rows: ScorecardRow[]
}

// Realizatul pentru contacte verificate = suma coloanei verificate din scorecard
// (deja filtrată pe locație de RPC). Conversiile vin din count-ul direct pe leads.
function ProgressBar({
  label,
  realizat,
  target,
}: {
  label: string
  realizat: number
  target: number | null
}) {
  const pct = target && target > 0 ? (realizat / target) * 100 : null
  const atins = pct != null && pct >= 100
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-quasar-black">{label}</span>
        <span className="text-quasar-gray">
          {realizat}
          {target != null ? ` / ${target}` : ''}
          {pct != null && (
            <span
              className={`ml-1 font-semibold ${atins ? 'text-green-600' : 'text-quasar-black'}`}
            >
              ({Math.round(pct)}%)
            </span>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-quasar-gray-light">
        <div
          className={`h-full rounded-full transition-all ${atins ? 'bg-green-500' : 'bg-quasar-yellow'}`}
          style={{ width: `${Math.min(100, pct ?? 0)}%` }}
        />
      </div>
      {target == null && (
        <p className="mt-1 text-xs text-quasar-gray">Obiectiv nesetat</p>
      )}
    </div>
  )
}

export function ObiectiveCard({ luna, locatie, rows }: Props) {
  const { role } = useAuth()
  const canEdit = isAdminOrHigher(role)
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<Record<ObiectivMetric, string>>({
    conversii: '',
    contacte_verificate: '',
  })

  const obiectiveQ = useQuery({
    queryKey: ['scorecard', 'obiective', luna],
    queryFn: () => listObiective(luna),
  })
  const conversiiQ = useQuery({
    queryKey: ['scorecard', 'conversii-count', luna, locatie],
    queryFn: () => getConversiiCount(luna, locatie),
  })

  const obiective = obiectiveQ.data
  useEffect(() => {
    if (obiective) {
      setDraft({
        conversii: obiective.conversii != null ? String(obiective.conversii) : '',
        contacte_verificate:
          obiective.contacte_verificate != null
            ? String(obiective.contacte_verificate)
            : '',
      })
    }
  }, [obiective])

  const realizatVerificate = rows.reduce(
    (s, r) => s + (r.contacte_verificate ?? 0),
    0,
  )
  const realizatConversii = conversiiQ.data ?? 0

  const saveM = useMutation({
    mutationFn: async () => {
      const entries: [ObiectivMetric, string][] = [
        ['conversii', draft.conversii],
        ['contacte_verificate', draft.contacte_verificate],
      ]
      for (const [metric, val] of entries) {
        const n = Number(val)
        if (val.trim() !== '' && Number.isFinite(n) && n >= 0) {
          await upsertObiectiv(luna, metric, n)
        }
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scorecard', 'obiective', luna] })
      setEdit(false)
    },
  })

  return (
    <div className="mb-4 rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-quasar-black">
          🎯 Obiectiv echipă — {luna}
        </h3>
        {canEdit && !edit && (
          <Button variant="secondary" onClick={() => setEdit(true)}>
            ✎ Setează
          </Button>
        )}
      </div>

      {edit ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Țintă conversii" htmlFor="ob-conv">
              <TextInput
                id="ob-conv"
                type="number"
                min={0}
                value={draft.conversii}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, conversii: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="w-48">
            <Field label="Țintă contacte verificate" htmlFor="ob-ver">
              <TextInput
                id="ob-ver"
                type="number"
                min={0}
                value={draft.contacte_verificate}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    contacte_verificate: e.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
          <Button variant="secondary" onClick={() => setEdit(false)}>
            Anulează
          </Button>
          {saveM.isError && (
            <p className="w-full text-sm text-red-600">
              Eroare la salvare:{' '}
              {humanizeError(saveM.error)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <ProgressBar
            label="Conversii"
            realizat={realizatConversii}
            target={obiective?.conversii ?? null}
          />
          <ProgressBar
            label="Contacte verificate"
            realizat={realizatVerificate}
            target={obiective?.contacte_verificate ?? null}
          />
        </div>
      )}
    </div>
  )
}
