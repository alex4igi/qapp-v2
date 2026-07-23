import { useQuery } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import {
  PageHeader,
  Spinner,
  Badge,
  DataTable,
  type Column,
} from '@/components/ui'
import {
  getHubData,
  type GrupaProgres,
  type AbsentaRisc,
  type EvaluariStats,
  type ZiNastere,
} from './api'

const SKILL_LABEL: Record<string, string> = {
  ritm: 'Ritm',
  pasi_baza: 'Pași de bază',
  coregrafie: 'Coregrafie',
  izolari: 'Izolări',
  coordonare: 'Coordonare',
  freeze: 'Freeze',
  sincronizare: 'Sincronizare',
  improvizatie: 'Improvizație',
  expresivitate: 'Expresivitate',
  prezentare: 'Prezentare',
}
const SKILL_ORDER = Object.keys(SKILL_LABEL)

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/* Sparkline mini pe seria de rate (0-100). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 60
  const h = 18
  const max = Math.max(...values, 100)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ── Cursanți la risc ─────────────────────────────────────────────────────── */
function AbsenteRiscSection({ rows }: { rows: AbsentaRisc[] }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-ink">⚠️ Cursanți la risc</h2>
        {rows.length > 0 && <Badge tone="danger">{rows.length}</Badge>}
      </div>
      <p className="mb-3 text-sm text-muted">
        Cursanți care au ratat cel puțin 2 săptămâni de ședințe la grupele tale —
        sună/scrie părintele înainte să plece.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-success-bg/40 px-3 py-4 text-center text-sm text-ink">
          🎉 Nimeni la risc acum — toți vin constant.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line-2">
          {rows.map((r) => (
            <div
              key={`${r.client_id}-${r.curs_id}`}
              className="flex items-center gap-3 border-t border-line-2 px-3 py-2.5 first:border-t-0"
            >
              <Badge tone="danger">{r.sedinte_ratate} ratate</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {r.client_nume}
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.curs_nume} · {r.zile_tacere} zile · ultima prezență{' '}
                  {formatData(r.ultima_prezenta)}
                </span>
                {r.vine_la && (
                  <span className="block truncate text-xs font-medium text-success">
                    ↪ vine la: {r.vine_la}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Tabelul grupelor ─────────────────────────────────────────────────────── */
function GrupeTable({ rows }: { rows: GrupaProgres[] }) {
  const columns: Column<GrupaProgres>[] = [
    {
      header: 'Grupă',
      cell: (g) => <span className="font-medium text-ink">{g.nume}</span>,
      sortValue: (g) => g.nume.toLowerCase(),
    },
    {
      header: 'Cursanți',
      cell: (g) => (
        <span className="text-ink">
          {g.activi}
          {g.capacitate ? (
            <span className="text-muted"> / {g.capacitate}</span>
          ) : null}
        </span>
      ),
      className: 'w-24',
      sortValue: (g) => g.activi,
    },
    {
      header: 'Ocupare',
      cell: (g) => <span className="text-ink">{pct(g.ocupare)}</span>,
      className: 'w-24',
      sortValue: (g) => g.ocupare ?? -1,
    },
    {
      header: 'Prezență',
      cell: (g) =>
        g.rataPrezenta == null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span
              className={g.prezentaInScadere ? 'text-danger' : 'text-muted'}
            >
              <Sparkline values={g.trendSaptamani} />
            </span>
            <span className="text-ink">{pct(g.rataPrezenta)}</span>
            {g.prezentaInScadere && <Badge tone="danger">↓</Badge>}
          </span>
        ),
      className: 'w-44',
      sortValue: (g) => g.rataPrezenta ?? -1,
    },
    {
      header: 'Reînscriere',
      cell: (g) =>
        g.reinscriereEligibili === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-ink">{pct(g.reinscriereProcent)}</span>
        ),
      className: 'w-28',
      sortValue: (g) => g.reinscriereProcent ?? -1,
    },
    {
      header: 'Concurs',
      cell: (g) =>
        g.concurs > 0 ? (
          <Badge tone="brand">{g.concurs}</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      className: 'w-24',
      sortValue: (g) => g.concurs,
    },
    {
      header: 'Spectacol',
      cell: (g) =>
        g.spectacol > 0 ? (
          <Badge tone="brand">{g.spectacol}</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      className: 'w-24',
      sortValue: (g) => g.spectacol,
    },
    {
      header: 'Plan',
      cell: (g) =>
        g.planSedintaCurenta == null || g.planTotal == null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-ink">
            {Math.min(g.planSedintaCurenta, g.planTotal)}/{g.planTotal}
            {g.planModulTema && (
              <span className="block truncate text-xs text-muted">{g.planModulTema}</span>
            )}
          </span>
        ),
      className: 'w-28',
      sortValue: (g) => g.planSedintaCurenta ?? -1,
    },
  ]

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">Grupele mele</h2>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(g) => g.cursId}
        emptyMessage="Nicio grupă activă în sezonul curent."
      />
      <p className="mt-2 text-xs text-muted">
        „Ocupare" = cursanți activi / capacitate. „Prezență" = rata medie pe
        ultimele săptămâni. „Reînscriere" apare doar la grupele cu sursă în
        sezonul anterior.
      </p>
    </section>
  )
}

/* ── Evaluări: media + abilități + trend ──────────────────────────────────── */
function EvaluariCard({ ev }: { ev: EvaluariStats }) {
  return (
    <div className="rounded-xl border border-line-2 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">
          {ev.curs_nume}
        </span>
        <span className="shrink-0 text-sm font-bold text-ink">
          {ev.media_generala != null ? `${ev.media_generala} / 5` : '—'}
        </span>
      </div>
      <p className="mb-2 text-xs text-muted">
        {ev.n_evaluari} evaluări · {ev.n_cursanti} cursanți (sezon curent)
      </p>
      {ev.skills && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {SKILL_ORDER.map((k) => {
            const val = ev.skills?.[k]
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-muted">
                  {SKILL_LABEL[k]}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-2">
                  <span
                    className="block h-full rounded-full bg-quasar-yellow"
                    style={{ width: `${((val ?? 0) / 5) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-ink">
                  {val ?? '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {ev.trend.length > 1 && (
        <div className="mt-3 border-t border-line-2 pt-2">
          <span className="mb-1 block text-xs text-muted">Istoric (media)</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {ev.trend.map((t, i) => (
              <span key={t.data} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-muted">→</span>}
                <span className="rounded bg-card px-1.5 py-0.5 text-ink">
                  {new Date(t.data).toLocaleDateString('ro-RO', {
                    month: 'short',
                    year: '2-digit',
                  })}
                  : <span className="font-semibold">{t.media}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvaluariSection({ rows }: { rows: EvaluariStats[] }) {
  const cuDate = rows.filter((e) => e.n_evaluari > 0)
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">Evaluări</h2>
      {cuDate.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-4 text-center text-sm text-muted">
          Nicio evaluare în sezonul curent. Adaugă din pagina{' '}
          <span className="font-medium text-ink">Evaluări</span> (se dau ~de 3×
          pe sezon: decembrie, aprilie, iunie).
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cuDate.map((ev) => (
            <EvaluariCard key={ev.curs_id} ev={ev} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Zile de naștere luna asta ────────────────────────────────────────────── */
function ZileNastereSection({ rows }: { rows: ZiNastere[] }) {
  if (rows.length === 0) return null
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">
        🎂 Zile de naștere luna aceasta
      </h2>
      <div className="flex flex-wrap gap-2">
        {rows.map((z) => (
          <span
            key={z.client_id}
            className={
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ' +
              (z.este_azi
                ? 'border-quasar-yellow bg-quasar-yellow/15 text-ink'
                : 'border-line-2 text-ink')
            }
            title={z.curs_nume}
          >
            <span className="font-bold text-muted">{z.zi}</span>
            <span className="font-medium">{z.client_nume}</span>
            {z.este_azi && <span>🎂</span>}
          </span>
        ))}
      </div>
    </section>
  )
}

export function GrupeleMelePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['teacher-hub'],
    queryFn: getHubData,
  })

  return (
    <div>
      <PageHeader
        title="Grupele mele"
        subtitle="Progresul grupelor tale — prezență, reînscrieri, evaluări"
      />

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-danger">
          Eroare la încărcare: {humanizeError(error)}
        </p>
      ) : !data ? null : (
        <div className="space-y-4">
          <AbsenteRiscSection rows={data.absenteRisc} />
          <ZileNastereSection rows={data.zileNastere} />
          <GrupeTable rows={data.grupe} />
          <EvaluariSection rows={data.evaluari} />
        </div>
      )}
    </div>
  )
}
