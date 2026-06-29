import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  PageHeader,
  Select,
  Spinner,
  Modal,
  DataTable,
  type Column,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { listSezoane } from '@/features/setari/api'
import { SimpleIncasareForm } from '@/features/plati/SimpleIncasareForm'
import {
  getReinscrieriProgress,
  listReinscrieriClienti,
  activateReinscriereLaSezon,
  getCampanieBySezon,
  getCampanieProgress,
  getCampanieProgressCurs,
  listCampanieClientiCurs,
  recordTaxaRezervare,
  setActAditionalManual,
  approveActAditional,
  rejectActAditional,
  closeCampanieReinscriere,
  deriveCampanieStare,
  type ReinscriereProgresRow,
  type ReinscriereClientRow,
  type CampanieReinscriere,
  type CampanieCursRow,
  type CampanieClientRow,
} from './api'
import { CampanieWizard } from './CampanieWizard'

const STARE_LABEL: Record<string, { label: string; cls: string }> = {
  planificata: { label: 'Planificată', cls: 'bg-quasar-gray/20 text-quasar-black' },
  activa: { label: 'Activă', cls: 'bg-green-100 text-green-800' },
  procesare: { label: 'Procesare', cls: 'bg-amber-100 text-amber-800' },
  incheiata: { label: 'Încheiată', cls: 'bg-quasar-gray/30 text-quasar-gray' },
}

export function ReinscrieriPage() {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canManage = isAdminOrHigher(role)
  const [sezonId, setSezonId] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  const sezoaneQ = useQuery({ queryKey: ['sezoane'], queryFn: listSezoane })

  const sezoaneOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (sezoaneQ.data ?? [])
      .filter(
        (s) =>
          s.tip === 'principal' &&
          s.stare === 'planificat' &&
          (!s.data_final || s.data_final >= today),
      )
      .map((s) => ({ value: s.id, label: s.numele_sezonului }))
  }, [sezoaneQ.data])

  useEffect(() => {
    if (!sezonId && sezoaneOptions.length > 0) {
      setSezonId(sezoaneOptions[0].value)
    }
  }, [sezonId, sezoaneOptions])

  const campanieQ = useQuery({
    queryKey: ['campanie-reinscriere', sezonId],
    enabled: Boolean(sezonId),
    queryFn: () => getCampanieBySezon(sezonId),
  })
  const campanie = campanieQ.data ?? null

  return (
    <div>
      <PageHeader
        title="Campania Reînscrieri"
        subtitle="Reînscrieri pentru sezonul de toamnă (sezon planificat)."
        actions={
          <div className="w-72">
            {sezoaneQ.isLoading ? (
              <Spinner />
            ) : sezoaneOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Nu există niciun sezon principal planificat.
              </p>
            ) : (
              <Select
                options={sezoaneOptions}
                value={sezonId}
                onChange={(e) => setSezonId(e.target.value)}
              />
            )}
          </div>
        }
      />

      {!sezonId ? (
        <p className="text-sm text-quasar-gray">Alege un sezon țintă.</p>
      ) : campanieQ.isLoading ? (
        <Spinner />
      ) : campanie ? (
        <CampanieBoard
          campanie={campanie}
          canManage={canManage}
          onChanged={() => {
            void queryClient.invalidateQueries({
              queryKey: ['campanie-reinscriere', sezonId],
            })
          }}
        />
      ) : (
        <LegacyBoard
          sezonId={sezonId}
          canManage={canManage}
          onCreateCampanie={() => setWizardOpen(true)}
        />
      )}

      {wizardOpen && (
        <CampanieWizard
          defaultSezonId={sezonId}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false)
            void queryClient.invalidateQueries({
              queryKey: ['campanie-reinscriere', sezonId],
            })
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Board cu campanie activă: KPI + porți per client
// ============================================================================

function CampanieBoard({
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

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-md px-3 py-2 ${
        highlight ? 'bg-amber-100' : 'bg-quasar-gray-light/30'
      }`}
    >
      <div className="text-xs text-quasar-gray">{label}</div>
      <div
        className={`text-lg font-semibold ${
          highlight ? 'text-amber-800' : 'text-quasar-black'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

// ============================================================================
// Modal per curs: porțile (taxă + act) pentru fiecare client eligibil
// ============================================================================

function CampanieCursModal({
  campanie,
  curs,
  canApprove,
  onClose,
  onChange,
}: {
  campanie: CampanieReinscriere
  curs: CampanieCursRow
  canApprove: boolean
  onClose: () => void
  onChange: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [taxaFor, setTaxaFor] = useState<CampanieClientRow | null>(null)
  const [actFor, setActFor] = useState<CampanieClientRow | null>(null)
  const [actLink, setActLink] = useState('')

  const clientiQ = useQuery({
    queryKey: ['campanie', 'clienti', campanie.id, curs.curs_id],
    queryFn: () => listCampanieClientiCurs(campanie.id, curs.curs_id),
  })

  const refresh = () => {
    void clientiQ.refetch()
    onChange()
  }

  const taxa = useMutation({
    mutationFn: (input: { clientId: string; incasareId: string }) =>
      recordTaxaRezervare({
        campanieId: campanie.id,
        clientId: input.clientId,
        cursTintaId: curs.curs_id,
        incasareId: input.incasareId,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la taxă.')),
  })

  const act = useMutation({
    mutationFn: (input: { clientId: string; link: string }) =>
      setActAditionalManual({
        campanieId: campanie.id,
        clientId: input.clientId,
        cursTintaId: curs.curs_id,
        documentLink: input.link,
      }),
    onSuccess: () => {
      setActFor(null)
      setActLink('')
      refresh()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la act adițional.')),
  })

  const approve = useMutation({
    mutationFn: (clientId: string) =>
      approveActAditional({
        campanieId: campanie.id,
        clientId,
        cursTintaId: curs.curs_id,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la aprobare.')),
  })

  const reject = useMutation({
    mutationFn: (clientId: string) =>
      rejectActAditional({
        campanieId: campanie.id,
        clientId,
        cursTintaId: curs.curs_id,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la respingere.')),
  })

  return (
    <Modal
      open
      title={`Reînscrieri — ${curs.curs_nume}`}
      onClose={onClose}
      size="lg"
      footer={<Button onClick={onClose}>Închide</Button>}
    >
      {clientiQ.isLoading ? (
        <Spinner />
      ) : (clientiQ.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun client eligibil pe acest curs.
        </p>
      ) : (
        <ul className="divide-y divide-quasar-gray/30">
          {(clientiQ.data ?? []).map((c) => {
            const taxaDone = Boolean(c.taxa_platita_la)
            const actVerificat = c.act_status === 'verificat'
            const actDeVerificat = c.act_status === 'de_verificat'
            const reinscris = Boolean(c.activat_la)
            return (
              <li key={c.client_id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">
                      {c.nume} {c.prenume ?? ''}
                    </span>
                    {c.telefon && (
                      <span className="ml-2 text-quasar-gray">{c.telefon}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Poarta 1: taxă */}
                    {taxaDone ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                        ✓ Taxă
                      </span>
                    ) : (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => setTaxaFor(c)}
                      >
                        Taxă
                      </Button>
                    )}
                    {/* Poarta 2: act adițional */}
                    {actVerificat ? (
                      c.document_link ? (
                        <a
                          href={c.document_link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 underline"
                        >
                          ✓ Act verificat
                        </a>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                          ✓ Act verificat
                        </span>
                      )
                    ) : actDeVerificat ? (
                      <div className="flex items-center gap-1">
                        {c.document_link && (
                          <a
                            href={c.document_link}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 underline"
                          >
                            Deschide
                          </a>
                        )}
                        {canApprove ? (
                          <>
                            <Button
                              className="text-xs"
                              onClick={() => approve.mutate(c.client_id)}
                              disabled={approve.isPending}
                            >
                              Aprobă
                            </Button>
                            <Button
                              className="text-xs"
                              variant="secondary"
                              onClick={() => reject.mutate(c.client_id)}
                              disabled={reject.isPending}
                            >
                              Respinge
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-amber-700">
                            așteaptă admin
                          </span>
                        )}
                      </div>
                    ) : c.act_status === 'trimis' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Trimis
                      </span>
                    ) : (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => {
                          setActFor(c)
                          setActLink(c.document_link ?? '')
                        }}
                      >
                        Act (link)
                      </Button>
                    )}
                    {/* Rezultat */}
                    {reinscris && (
                      <span className="rounded-full bg-quasar-yellow px-2 py-0.5 text-xs font-bold text-quasar-black">
                        ✓ Reînscris
                      </span>
                    )}
                  </div>
                </div>

                {/* Input inline pentru link act adițional manual (intră ca „de verificat") */}
                {actFor?.client_id === c.client_id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="flex-1 rounded border border-quasar-gray-light px-2 py-1 text-sm"
                      placeholder="Link esemneaza.ro / Google Drive (document semnat)…"
                      value={actLink}
                      onChange={(e) => setActLink(e.target.value)}
                    />
                    <Button
                      className="text-xs"
                      onClick={() =>
                        act.mutate({ clientId: c.client_id, link: actLink })
                      }
                      disabled={act.isPending || !actLink.trim()}
                    >
                      Salvează
                    </Button>
                    <Button
                      className="text-xs"
                      variant="secondary"
                      onClick={() => {
                        setActFor(null)
                        setActLink('')
                      }}
                    >
                      Anulează
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Modal taxă de rezervare (reutilizează formularul Plată nouă → Taxa) */}
      {taxaFor && (
        <Modal
          open
          title={`Taxă de rezervare — ${taxaFor.nume} ${taxaFor.prenume ?? ''}`}
          onClose={() => setTaxaFor(null)}
          size="lg"
        >
          <SimpleIncasareForm
            tip="Taxa"
            defaultClientId={taxaFor.client_id}
            defaultSuma={String(campanie.taxa_rezervare)}
            defaultObservatii={`Taxă rezervare reînscriere — ${curs.curs_nume}`}
            onCreated={(inc) => {
              const clientId = taxaFor.client_id
              setTaxaFor(null)
              void queryClient.invalidateQueries({ queryKey: ['plati'] })
              taxa.mutate({ clientId, incasareId: inc.id })
            }}
            onClose={() => setTaxaFor(null)}
          />
        </Modal>
      )}
    </Modal>
  )
}

// ============================================================================
// Board legacy (sezon fără campanie): progres + activare clasică „Activează"
// ============================================================================

function LegacyBoard({
  sezonId,
  canManage,
  onCreateCampanie,
}: {
  sezonId: string
  canManage: boolean
  onCreateCampanie: () => void
}) {
  const queryClient = useQueryClient()
  const [openCurs, setOpenCurs] = useState<ReinscriereProgresRow | null>(null)

  const progresQ = useQuery({
    queryKey: ['reinscrieri', 'progres', sezonId],
    queryFn: () => getReinscrieriProgress(sezonId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reinscrieri', 'progres', sezonId] })
    if (openCurs) {
      void queryClient.invalidateQueries({
        queryKey: ['reinscrieri', 'clienti', openCurs.curs_id],
      })
    }
  }

  const columns: Column<ReinscriereProgresRow>[] = [
    {
      header: 'Curs',
      cell: (r) => <span className="font-medium">{r.curs_nume}</span>,
      sortValue: (r) => r.curs_nume?.toLowerCase(),
    },
    {
      header: 'Grupă',
      cell: (r) => r.varsta ?? '—',
      className: 'w-32',
      sortValue: (r) => r.varsta?.toLowerCase(),
    },
    {
      header: 'Eligibili',
      cell: (r) => r.total_eligibili,
      className: 'w-24 text-right',
      sortValue: (r) => r.total_eligibili ?? 0,
    },
    {
      header: 'Activați',
      cell: (r) => <span className="font-semibold text-quasar-black">{r.activati}</span>,
      className: 'w-24 text-right',
      sortValue: (r) => r.activati ?? 0,
    },
    {
      header: 'Rămași',
      cell: (r) => r.ramasi,
      className: 'w-24 text-right',
      sortValue: (r) => r.ramasi ?? 0,
    },
    {
      header: 'Progres',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-quasar-gray/30">
            <div
              className="h-full bg-quasar-yellow"
              style={{ width: `${Math.min(100, r.procent)}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm">{r.procent}%</span>
        </div>
      ),
      className: 'w-48',
      sortValue: (r) => r.procent ?? 0,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md bg-quasar-gray-light/30 px-3 py-2">
        <p className="text-sm text-quasar-gray">
          Nicio campanie organizată pe acest sezon. Poți activa reînscrieri
          individual (flux clasic) sau porni o campanie cu target, taxă și act
          adițional.
        </p>
        {canManage && (
          <Button onClick={onCreateCampanie}>Creează campanie</Button>
        )}
      </div>

      {progresQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={progresQ.data ?? []}
          rowKey={(r) => r.curs_id}
          onRowClick={(r) => setOpenCurs(r)}
          emptyMessage="Niciun curs în sezonul țintă."
        />
      )}

      {openCurs && (
        <LegacyCursModal
          curs={openCurs}
          onClose={() => setOpenCurs(null)}
          onChange={invalidate}
        />
      )}
    </div>
  )
}

function LegacyCursModal(props: {
  curs: ReinscriereProgresRow
  onClose: () => void
  onChange: () => void
}) {
  const { curs } = props
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['reinscrieri', 'clienti', curs.curs_id],
    queryFn: () => listReinscrieriClienti(curs.curs_id),
  })

  const activate = useMutation({
    mutationFn: (clientId: string) =>
      activateReinscriereLaSezon(clientId, curs.curs_id),
    onSuccess: () => {
      void clientiQ.refetch()
      props.onChange()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la activare.')),
  })

  const activateBulk = useMutation({
    mutationFn: async (clienti: ReinscriereClientRow[]) => {
      for (const c of clienti) {
        if (c.activata) continue
        await activateReinscriereLaSezon(c.client_id, curs.curs_id)
      }
    },
    onSuccess: () => {
      void clientiQ.refetch()
      props.onChange()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la activare în bulk.')),
  })

  const ramasi = (clientiQ.data ?? []).filter((c) => !c.activata)

  return (
    <Modal
      open
      title={`Reînscrieri — ${curs.curs_nume}`}
      onClose={props.onClose}
      size="lg"
      footer={
        <>
          {ramasi.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => activateBulk.mutate(clientiQ.data ?? [])}
              disabled={activateBulk.isPending}
            >
              Activează toți ({ramasi.length})
            </Button>
          )}
          <Button onClick={props.onClose}>Închide</Button>
        </>
      }
    >
      {clientiQ.isLoading ? (
        <Spinner />
      ) : (clientiQ.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun client eligibil pe acest curs.
        </p>
      ) : (
        <ul className="divide-y divide-quasar-gray/30">
          {(clientiQ.data ?? []).map((c) => (
            <li
              key={c.client_id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <span className="font-medium">
                  {c.nume} {c.prenume ?? ''}
                </span>
                {c.telefon && (
                  <span className="ml-2 text-quasar-gray">{c.telefon}</span>
                )}
              </div>
              {c.activata ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                  ✓ Activat
                </span>
              ) : (
                <Button
                  className="text-xs"
                  onClick={() => activate.mutate(c.client_id)}
                  disabled={activate.isPending}
                >
                  Activează
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  )
}
