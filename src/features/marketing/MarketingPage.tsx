import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  Field,
  DateInput,
  Tabs,
  Spinner,
  DataTable,
  type Column,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getReconciliere, getFunnelPeSursa, type ReconciliereRow, type FunnelRow } from './api'
import { exportReconciliereCsv } from './csv'
import { DATA_START_LOG_INTAKE } from './constants'

function isoAcum(offsetZile = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetZile)
  return d.toISOString().slice(0, 10)
}

function procent(parte: number, intreg: number): string {
  if (!intreg) return '—'
  return `${Math.round((parte / intreg) * 100)}%`
}

const TABS = [
  { id: 'reconciliere', label: 'Reconciliere' },
  { id: 'funnel', label: 'Funnel pe sursă' },
]

export function MarketingPage() {
  const [tab, setTab] = useState('reconciliere')
  const [from, setFrom] = useState(isoAcum(-30))
  const [to, setTo] = useState(isoAcum())

  return (
    <div>
      <PageHeader
        title="Reconciliere ads"
        subtitle="Ce raportează Google/Meta vs. ce a intrat în CRM"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="De la" htmlFor="mkt-from">
            <DateInput
              id="mkt-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="mkt-to">
            <DateInput
              id="mkt-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'reconciliere' ? (
        <ReconciliereTab from={from} to={to} />
      ) : (
        <FunnelTab from={from} to={to} />
      )}
    </div>
  )
}

/* ---------------- Reconciliere ---------------- */

const RECONCILIERE_COLUMNS: Column<ReconciliereRow>[] = [
  {
    header: 'Zi',
    cell: (r) => r.zi,
    className: 'w-28',
    sortValue: (r) => r.zi,
  },
  {
    header: 'Platformă',
    cell: (r) => r.platforma,
    className: 'w-28',
    sortValue: (r) => r.platforma,
  },
  {
    header: 'Campanie',
    cell: (r) => <span className="font-medium">{r.campanieAds}</span>,
    sortValue: (r) => r.campanieAds,
  },
  {
    header: 'Primite',
    cell: (r) => (r.intakeEvenimente ? r.intakeEvenimente : '—'),
    className: 'w-24 text-right',
    sortValue: (r) => r.intakeEvenimente,
  },
  {
    header: 'Duplicate',
    cell: (r) =>
      r.intakeDuplicat ? (
        <span className="text-amber-700">{r.intakeDuplicat}</span>
      ) : (
        '—'
      ),
    className: 'w-24 text-right',
    sortValue: (r) => r.intakeDuplicat,
  },
  {
    header: 'Respinse',
    cell: (r) =>
      r.intakeRespins ? (
        <span className="text-red-600">{r.intakeRespins}</span>
      ) : (
        '—'
      ),
    className: 'w-24 text-right',
    sortValue: (r) => r.intakeRespins,
  },
  {
    header: 'În CRM',
    cell: (r) => <span className="font-medium">{r.leadsInCrm}</span>,
    className: 'w-24 text-right',
    sortValue: (r) => r.leadsInCrm,
  },
  {
    header: 'Contactate',
    cell: (r) => r.contactati,
    className: 'w-28 text-right',
    sortValue: (r) => r.contactati,
  },
  {
    header: 'Au venit',
    cell: (r) => r.prezenti,
    className: 'w-24 text-right',
    sortValue: (r) => r.prezenti,
  },
  {
    header: 'Înscrise',
    cell: (r) => <span className="font-medium">{r.convertiti}</span>,
    className: 'w-24 text-right',
    sortValue: (r) => r.convertiti,
  },
]

function ReconciliereTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['marketing', 'reconciliere', from, to],
    queryFn: () => getReconciliere(from, to),
  })

  const total = useMemo(() => {
    const rows = data ?? []
    return rows.reduce(
      (a, r) => ({
        primite: a.primite + r.intakeEvenimente,
        duplicate: a.duplicate + r.intakeDuplicat,
        respinse: a.respinse + r.intakeRespins,
        inCrm: a.inCrm + r.leadsInCrm,
        inscrise: a.inscrise + r.convertiti,
      }),
      { primite: 0, duplicate: 0, respinse: 0, inCrm: 0, inscrise: 0 },
    )
  }, [data])

  if (isLoading) return <Spinner />
  if (isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(error)}
      </p>
    )

  const rows = data ?? []
  const acoperaIstoric = from < DATA_START_LOG_INTAKE

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-6 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
        <Kpi label="Evenimente primite" value={total.primite} />
        <Kpi label="Deja în CRM (duplicate)" value={total.duplicate} />
        <Kpi label="Respinse la validare" value={total.respinse} />
        <Kpi label="Lead-uri în CRM" value={total.inCrm} />
        <Kpi label="Înscrieri" value={total.inscrise} />
        <div className="ml-auto">
          <Button
            variant="secondary"
            onClick={() =>
              exportReconciliereCsv(rows, `reconciliere-ads_${from}_${to}.csv`)
            }
          >
            Export CSV
          </Button>
        </div>
      </div>

      {acoperaIstoric && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Coloanele <strong>Primite / Duplicate / Respinse</strong> există doar
          din {DATA_START_LOG_INTAKE}, de când se scrie logul de intake. Pentru
          zilele anterioare se vede doar ce a rămas în CRM — „—” înseamnă „nu
          știm”, nu „zero”.
        </p>
      )}

      <p className="mb-3 text-sm text-muted-2">
        <strong>Primite</strong> = câte evenimente a trimis platforma.{' '}
        <strong>Duplicate</strong> = persoane care erau deja în CRM (același
        telefon) — campania le-a re-atins, dar nu produc un lead nou. De aceea
        „Primite” e de obicei mai mare decât „În CRM”.
      </p>

      <DataTable
        columns={RECONCILIERE_COLUMNS}
        rows={rows}
        rowKey={(r) => `${r.zi}|${r.platforma}|${r.campanieAds}`}
        emptyMessage="Nimic în perioada asta."
      />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-2">{label}</div>
      <div className="font-display text-lg font-bold text-ink">{value}</div>
    </div>
  )
}

/* ---------------- Funnel ---------------- */

function FunnelTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['marketing', 'funnel', from, to],
    queryFn: () => getFunnelPeSursa(from, to),
  })

  if (isLoading) return <Spinner />
  if (isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(error)}
      </p>
    )

  const columns: Column<FunnelRow>[] = [
    {
      header: 'Sursă',
      cell: (r) => <span className="font-medium">{r.sursaNume}</span>,
      sortValue: (r) => r.sursaNume,
    },
    {
      header: 'Lead-uri',
      cell: (r) => <span className="font-medium">{r.leads}</span>,
      className: 'w-24 text-right',
      sortValue: (r) => r.leads,
    },
    {
      header: 'Contactate',
      cell: (r) => `${r.contactati} (${procent(r.contactati, r.leads)})`,
      className: 'w-36 text-right',
      sortValue: (r) => r.contactati,
    },
    {
      header: 'Programate',
      cell: (r) => `${r.proba} (${procent(r.proba, r.leads)})`,
      className: 'w-36 text-right',
      sortValue: (r) => r.proba,
    },
    {
      header: 'Au venit',
      cell: (r) => `${r.prezenti} (${procent(r.prezenti, r.leads)})`,
      className: 'w-36 text-right',
      sortValue: (r) => r.prezenti,
    },
    {
      header: 'Înscrise',
      cell: (r) => (
        <span className="font-medium">
          {r.convertiti} ({procent(r.convertiti, r.leads)})
        </span>
      ),
      className: 'w-36 text-right',
      sortValue: (r) => r.convertiti,
    },
  ]

  return (
    <div>
      <p className="mb-3 text-sm text-muted-2">
        Trepte cumulative, pe cohortă de intrare a lead-ului: fiecare treaptă o
        cuprinde pe următoarea. Procentele sunt din totalul sursei.
      </p>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.sursaNume}
        emptyMessage="Nimic în perioada asta."
      />
    </div>
  )
}
