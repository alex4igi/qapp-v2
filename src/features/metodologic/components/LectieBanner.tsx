import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Badge, Button } from '@/components/ui'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { confirmaSedinta, getLectieAzi } from '../api'
import { JurnalConfirmModal } from '../modals/JurnalConfirmModal'
import type { StatusJurnal } from '../types'

type Props = {
  cursId: string
  /** Ziua lucrată (ISO). Bannerul arată lecția pentru ea. */
  data: string
}

/**
 * „Ce predau azi la grupa asta" + confirmarea de predare.
 *
 * Nu randează nimic dacă grupa n-are program metodologic asociat — feature-ul e
 * inofensiv pe grupele neconfigurate.
 */
export function LectieBanner({ cursId, data }: Props) {
  const qc = useQueryClient()
  const { teacherId } = useCurrentTeacherId()
  const [extins, setExtins] = useState(false)
  const [modalDeviere, setModalDeviere] = useState(false)

  const query = useQuery({
    queryKey: ['lectie-azi', cursId, data],
    queryFn: () => getLectieAzi(cursId, data),
  })

  const confirma = useMutation({
    mutationFn: async ({ status, nota }: { status: StatusJurnal; nota: string | null }) => {
      const l = query.data
      if (!l) return
      await confirmaSedinta({
        cursId,
        data,
        nrSedinta: l.nr_sedinta,
        lectieId: l.lectie_id,
        status,
        nota,
        teacherId,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lectie-azi', cursId, data] })
      void qc.invalidateQueries({ queryKey: ['teacher-hub'] })
    },
  })

  const l = query.data
  if (query.isLoading || !l) return null

  return (
    <section className="mb-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              Ședința {l.nr_sedinta}/{l.total_sedinte}
            </Badge>
            <span className="text-xs font-medium text-muted">
              MODUL {l.modul_numar}
              {l.modul_tema && ` — ${l.modul_tema}`}
            </span>
            {l.adaptat && <Badge tone="neutral">adaptat</Badge>}
            {l.jurnal_status === 'conform' && <Badge tone="success">✓ predat conform</Badge>}
            {l.jurnal_status === 'diferit' && <Badge tone="warn">≠ altfel</Badge>}
          </div>
          <p className="text-sm font-semibold text-ink">{l.titlu}</p>
          {l.depasit && (
            <p className="mt-1 text-xs text-warn">
              Grupa a depășit programul sezonului — ultima lecție planificată.
            </p>
          )}
          {l.note && (
            <>
              {extins && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {l.note}
                </p>
              )}
              <button
                type="button"
                onClick={() => setExtins((v) => !v)}
                className="mt-1 text-xs font-medium text-muted underline hover:text-ink"
              >
                {extins ? 'Ascunde notele' : 'Vezi notele lecției'}
              </button>
            </>
          )}
          {l.jurnal_status === 'diferit' && l.jurnal_nota && (
            <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
              Raportat: {l.jurnal_nota}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant={l.jurnal_status === 'conform' ? 'secondary' : 'primary'}
            onClick={() => confirma.mutate({ status: 'conform', nota: null })}
            disabled={confirma.isPending}
          >
            ✓ Predat conform planului
          </Button>
          <Button variant="ghost" onClick={() => setModalDeviere(true)}>
            Am făcut altceva
          </Button>
        </div>
      </div>

      {confirma.isError && (
        <p className="mt-2 text-sm text-danger">{humanizeError(confirma.error)}</p>
      )}

      <JurnalConfirmModal
        open={modalDeviere}
        nrSedinta={l.nr_sedinta}
        titluPlanificat={l.titlu}
        notaInitiala={l.jurnal_nota}
        onClose={() => setModalDeviere(false)}
        onSave={async (nota) => {
          await confirma.mutateAsync({ status: 'diferit', nota })
        }}
      />
    </section>
  )
}
