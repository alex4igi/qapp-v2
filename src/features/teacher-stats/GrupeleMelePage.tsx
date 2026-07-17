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

/* ── Cursanți la risc ─────────────────────────────────────────────────────── */
function AbsenteRiscSection({ rows }: { rows: AbsentaRisc[] }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-ink">⚠️ Cursanți la risc</h2>
        {rows.length > 0 && <Badge tone="danger">{rows.length}</Badge>}
      </div>
      <p className="mb-3 text-sm text-muted">
        Cursanți cu absențe consecutive la grupele tale — sună/scrie părintele
        înainte să plece.
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
              <Badge tone="danger">{r.absente_consecutive} abs.</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {r.client_nume}
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.curs_nume} · ultima prezență {formatData(r.ultima_prezenta)}
                </span>
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
          <span className="inline-flex items-center gap-1.5">
            <span className="text-ink">{pct(g.rataPrezenta)}</span>
            {g.prezentaInScadere && <Badge tone="danger">↓ scade</Badge>}
          </span>
        ),
      className: 'w-32',
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
          <GrupeTable rows={data.grupe} />
          <EvaluariSection rows={data.evaluari} />
        </div>
      )}
    </div>
  )
}
