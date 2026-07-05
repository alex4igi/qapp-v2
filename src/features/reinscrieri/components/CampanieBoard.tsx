import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import {
  getCampanieProgress,
  getCampanieProgressCurs,
  closeCampanieReinscriere,
  deriveCampanieStare,
  type CampanieReinscriere,
  type CampanieCursRow,
} from '../api'
import { Kpi } from './Kpi'
import { CampanieCursModal } from '../modals/CampanieCursModal'

const STARE_LABEL: Record<string, { label: string; cls: string }> = {
  planificata: { label: 'Planificată', cls: 'bg-quasar-gray/20 text-quasar-black' },
  activa: { label: 'Activă', cls: 'bg-green-100 text-green-800' },
  procesare: { label: 'Procesare', cls: 'bg-amber-100 text-amber-800' },
  incheiata: { label: 'Încheiată', cls: 'bg-quasar-gray/30 text-quasar-gray' },
}

// Board cu campanie activă: KPI + porți per client.
export function CampanieBoard({
  campanie,
  canManage,
  onChanged,
}: {
  campanie: CampanieReinscriere
  canManage: boolean
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [openCurs, setOpenCurs] = useState<CampanieCursRow | null>(null)

  const stare = deriveCampanieStare(campanie)
  const stareInfo = STARE_LABEL[stare]

  const progresQ = useQuery({
    queryKey: ['campanie', 'progres', campanie.id],
    queryFn: () => getCampanieProgress(campanie.id),
  })
  const curseQ = useQuery({
    queryKey: ['campanie', 'curse', campanie.id],
    queryFn: () => getCampanieProgressCurs(campanie.id),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['campanie', 'progres', campanie.id] })
    void queryClient.invalidateQueries({ queryKey: ['campanie', 'curse', campanie.id] })
    if (openCurs) {
      void queryClient.invalidateQueries({
        queryKey: ['campanie', 'clienti', campanie.id, openCurs.curs_id],
      })
    }
  }

  const close = useMutation({
    mutationFn: () => closeCampanieReinscriere(campanie.id),
    onSuccess: onChanged,
  })

  const p = progresQ.data
  const procent = p?.procent ?? 0

  const columns: Column<CampanieCursRow>[] = [
    {
      header: 'Curs',
      cell: (r) => <span className="font-medium">{r.curs_nume}</span>,
      sortValue: (r) => r.curs_nume?.toLowerCase(),
    },
    {
      header: 'Grupă',
      cell: (r) => r.varsta ?? '—',
      className: 'w-28',
      sortValue: (r) => r.varsta?.toLowerCase(),
    },
    {
      header: 'Eligibili',
      cell: (r) => r.total_eligibili,
      className: 'w-20 text-right',
      sortValue: (r) => r.total_eligibili ?? 0,
    },
    {
      header: 'Taxă',
      cell: (r) => <span className="text-quasar-gray">{r.taxa_done}</span>,
      className: 'w-16 text-right',
      sortValue: (r) => r.taxa_done ?? 0,
    },
    {
      header: 'Act',
      cell: (r) => (
        <span className="text-quasar-gray">
          {r.act_done}
          {r.act_de_verificat > 0 && (
            <span className="ml-1 text-xs font-semibold text-amber-600">
              (+{r.act_de_verificat} de verificat)
            </span>
          )}
        </span>
      ),
      className: 'w-32 text-right',
      sortValue: (r) => r.act_done ?? 0,
    },
    {
      header: 'Reînscriși',
      cell: (r) => <span className="font-semibold text-quasar-black">{r.ambele}</span>,
      className: 'w-24 text-right',
      sortValue: (r) => r.ambele ?? 0,
    },
    {
      header: 'Rămași',
      cell: (r) => r.ramasi,
      className: 'w-20 text-right',
      sortValue: (r) => r.ramasi ?? 0,
    },
    {
      header: 'Ocupare toamnă',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="w-14 text-right text-sm">
            {r.activi}/{r.capacitate ?? '—'}
          </span>
          {r.procent_ocupare != null && (
            <span
              className={`text-xs font-semibold ${
                r.procent_ocupare >= 100
                  ? 'text-red-600'
                  : r.procent_ocupare >= 70
                    ? 'text-green-700'
                    : 'text-amber-600'
              }`}
            >
              {r.procent_ocupare}%
            </span>
          )}
        </div>
      ),
      className: 'w-40',
      sortValue: (r) => r.procent_ocupare ?? 0,
    },
  ]

  return (
    <div className="space-y-4">
      {/* KPI campanie */}
      <div className="rounded-lg border border-quasar-gray-light p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{campanie.nume}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${stareInfo.cls}`}>
                {stareInfo.label}
              </span>
            </div>
            <p className="text-sm text-quasar-gray">
              {campanie.data_incepere} → {campanie.data_final} · taxă{' '}
              {campanie.taxa_rezervare} RON · procesare {campanie.zile_procesare} zile
            </p>
          </div>
          {canManage && !campanie.inchisa_la && (
            <Button
              variant="secondary"
              onClick={() => close.mutate()}
              disabled={close.isPending}
            >
              {close.isPending ? 'Se închide…' : 'Închide campania'}
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Kpi label="Reînscriși" value={`${p?.re_inscrisi ?? 0} / ${p?.target_clienti ?? 0}`} />
          <Kpi label="În proces" value={p?.in_proces ?? 0} />
          <Kpi label="Taxă plătită" value={p?.taxa_done ?? 0} />
          <Kpi label="Act verificat" value={p?.act_done ?? 0} />
          <Kpi
            label="Acte de verificat"
            value={p?.act_de_verificat ?? 0}
            highlight={(p?.act_de_verificat ?? 0) > 0}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-quasar-gray/30">
            <div
              className="h-full bg-quasar-yellow"
              style={{ width: `${Math.min(100, procent)}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm">{procent}%</span>
        </div>
      </div>

      {curseQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={curseQ.data ?? []}
          rowKey={(r) => r.curs_id}
          onRowClick={(r) => setOpenCurs(r)}
          emptyMessage="Niciun curs recurent în sezonul țintă."
        />
      )}

      {openCurs && (
        <CampanieCursModal
          campanie={campanie}
          curs={openCurs}
          canApprove={canManage}
          onClose={() => setOpenCurs(null)}
          onChange={invalidate}
        />
      )}
    </div>
  )
}
