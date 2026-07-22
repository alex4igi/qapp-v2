import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { ClientMatcher } from './ClientMatcher'
import { FacturaDialog } from './FacturaDialog'
import { MarcheazaDialog } from './MarcheazaDialog'
import {
  ignoraFacturi,
  ingestExtras,
  listBancaIstoric,
  listBancaWorklist,
  salveazaPlataBanca,
} from './api'
import type { FacturaLinie, FacturaRow, MatchSuggestion } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const isFacturat = (r: FacturaRow) => r.status === 'Emisa' || r.status === 'Marcata'

// Secțiunile goale se ascund: „De facturat (0)" cu tabel gol e zgomot, nu informație.
function Sectiune({
  titlu,
  explicatie,
  rows,
  columns,
}: {
  titlu: string
  explicatie: string
  rows: FacturaRow[]
  columns: Column<FacturaRow>[]
}) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">
          {titlu} <span className="font-normal text-muted">({rows.length})</span>
        </h3>
        <p className="text-xs text-muted">{explicatie}</p>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.ref} />
    </section>
  )
}

async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let text = new TextDecoder('utf-8').decode(buf)
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf)
  return text
}

export function BancaTab() {
  const { role } = useAuth()
  const canUpload = isAdminOrHigher(role)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [matches, setMatches] = useState<Record<string, MatchSuggestion | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [plataFor, setPlataFor] = useState<{ ref: string; clientId?: string; suma: number } | null>(
    null,
  )
  const [facturaFor, setFacturaFor] = useState<{ row: FacturaRow; match: MatchSuggestion | null } | null>(
    null,
  )
  const [marcheazaFor, setMarcheazaFor] = useState<FacturaRow | null>(null)

  const pending = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'worklist'],
    queryFn: () => listBancaWorklist(),
  })
  const recent = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'istoric'],
    queryFn: () => listBancaIstoric(),
  })

  // Lista amestecă două joburi diferite (înregistrarea plății și emiterea facturii), iar
  // un rând iese abia când ambele sunt gata. Nedespărțite, cele două arătau ca un tabel
  // instabil: facturezi trei rânduri la rând și dispar doar cele care aveau deja plata.
  // Fiecare secțiune numește exact ce a mai rămas de făcut.
  const { nou, deFacturat, dePlata } = useMemo(() => {
    const all = pending.data ?? []
    return {
      nou: all.filter((r) => !isFacturat(r) && !r.platit_la),
      deFacturat: all.filter((r) => !isFacturat(r) && r.platit_la),
      dePlata: all.filter((r) => isFacturat(r) && !r.platit_la),
    }
  }, [pending.data])
  const total = nou.length + deFacturat.length + dePlata.length

  const matchOf = (r: FacturaRow): MatchSuggestion | null => matches[r.ref] ?? null

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })

  const ingest = useMutation({
    mutationFn: async (csv: string) => ingestExtras(csv),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la încărcare.')),
  })

  const onFile = async (file: File) => {
    setError(null)
    try {
      const csv = await readCsv(file)
      ingest.mutate(csv)
    } catch (e) {
      setError(humanizeError(e, 'Nu am putut citi fișierul.'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const savePlata = useMutation({
    mutationFn: (v: { ref: string; linii: FacturaLinie[] }) =>
      salveazaPlataBanca(v.ref, v.linii),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la marcarea plății.')),
  })

  const ignoraOne = useMutation({
    mutationFn: (ref: string) => ignoraFacturi([ref]),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ignorare.')),
  })

  const columns: Column<FacturaRow>[] = useMemo(
    () => [
      { header: 'Data', cell: (r) => r.data_tranzactie, sortValue: (r) => r.data_tranzactie },
      { header: 'Plătitor', cell: (r) => r.client_nume, sortValue: (r) => r.client_nume },
      {
        header: 'Client în CRM',
        className: 'min-w-[220px]',
        cell: (r) => (
          <ClientMatcher
            payerNume={r.client_nume}
            descriere={r.descriere ?? ''}
            value={matchOf(r)}
            onChange={(m) => setMatches((prev) => ({ ...prev, [r.ref]: m }))}
          />
        ),
      },
      {
        header: 'Descriere',
        className: 'min-w-[180px]',
        cell: (r) => <span className="text-sm text-muted">{r.descriere}</span>,
      },
      {
        header: 'Sumă',
        className: 'text-right whitespace-nowrap',
        cell: (r) => `${fmt(r.suma)} ${r.valuta}`,
        sortValue: (r) => r.suma,
      },
      {
        header: 'Stare',
        className: 'whitespace-nowrap',
        cell: (r) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {r.platit_la && <span className="text-green-700">✓ înregistrat</span>}
            {isFacturat(r) &&
              (r.factura_link ? (
                <a
                  href={r.factura_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-green-700 underline"
                >
                  ✓ facturat {r.factura_fgo ?? ''}
                </a>
              ) : (
                <span className="text-green-700">✓ facturat {r.factura_fgo ?? ''}</span>
              ))}
            {r.status === 'Eroare' && (
              <span className="text-red-700">✗ {r.eroare_mesaj}</span>
            )}
          </div>
        ),
      },
      {
        header: '',
        className: 'whitespace-nowrap',
        cell: (r) => {
          const m = matchOf(r)
          const platit = !!r.platit_la
          const facturat = isFacturat(r)
          return (
            <div className="flex flex-wrap items-center gap-2">
              {!platit && (
                <Button
                  variant="secondary"
                  disabled={!m}
                  title={
                    m
                      ? m.tip === 'familie'
                        ? 'Plată nouă (Transfer) — alege membrul familiei'
                        : 'Plată nouă (Transfer) pre-completată cu clientul și suma'
                      : 'Alege întâi clientul din CRM'
                  }
                  onClick={() =>
                    setPlataFor({
                      ref: r.ref,
                      clientId: m?.tip === 'client' ? m.id : undefined,
                      suma: r.suma,
                    })
                  }
                >
                  💳 Plată
                </Button>
              )}
              {!facturat && (
                <Button variant="secondary" onClick={() => setFacturaFor({ row: r, match: m })}>
                  🧾 Facturează
                </Button>
              )}
              <button
                type="button"
                className="text-xs text-muted underline hover:text-ink"
                onClick={() => ignoraOne.mutate(r.ref)}
                title="Scoate transferul din listă (nu se facturează)"
              >
                Ignoră
              </button>
              {!facturat && (
                <button
                  type="button"
                  className="text-xs text-muted underline hover:text-ink"
                  onClick={() => setMarcheazaFor(r)}
                  title="Facturat deja manual în FGO — cere numărul facturii, nu emite nimic"
                >
                  Marcată
                </button>
              )}
            </div>
          )
        },
      },
    ],
    [matches, ignoraOne],
  )

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="rounded-2xl border border-dashed border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Încarcă extrasul de cont (CSV ING)</p>
              <p className="text-xs text-muted">
                Firma se detectează automat după IBAN. Doar încasările apar mai jos.
              </p>
            </div>
            <Button onClick={() => fileRef.current?.click()} disabled={ingest.isPending}>
              {ingest.isPending ? 'Se procesează…' : 'Alege fișier CSV'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>
          {ingest.data && (
            <p className="mt-3 text-sm text-ink">
              <strong>{ingest.data.firma.nume}</strong> · {ingest.data.inserted} încasări noi
              {ingest.data.duplicates > 0 && ` · ${ingest.data.duplicates} deja în registru`}
              {ingest.data.ignored > 0 && ` · ${ingest.data.ignored} ignorate (plăți/POS)`}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {pending.isLoading ? (
        <Spinner />
      ) : total === 0 ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-muted">
          Nicio încasare de procesat. Încarcă un extras de cont.
        </div>
      ) : (
        <div className="space-y-6">
          <Sectiune
            titlu="Nou din extras"
            explicatie="Nici plata înregistrată, nici factura emisă — de făcut amândouă."
            rows={nou}
            columns={columns}
          />
          <Sectiune
            titlu="De facturat"
            explicatie="Plata e înregistrată în CRM. Mai lipsește doar factura."
            rows={deFacturat}
            columns={columns}
          />
          <Sectiune
            titlu="De înregistrat plata"
            explicatie="Factura e deja emisă. Mai lipsește doar înregistrarea plății în CRM."
            rows={dePlata}
            columns={columns}
          />
          <p className="text-xs text-muted">
            Un transfer iese din listă abia când e <strong>și</strong> înregistrat ca plată,{' '}
            <strong>și</strong> facturat. După aceea îl găsești în Istoric.
          </p>
        </div>
      )}

      {(recent.data ?? []).length > 0 && (
        <details className="rounded-2xl border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Istoric ({(recent.data ?? []).length})
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {(recent.data ?? []).map((r) => (
              <li key={r.ref} className="flex justify-between gap-3">
                <span className="text-ink">
                  {r.data_tranzactie} · {r.client_nume} · {fmt(r.suma)} RON
                </span>
                <span className={r.status === 'Eroare' ? 'text-red-700' : 'text-muted'}>
                  {[
                    r.platit_la ? 'înregistrat' : null,
                    r.status === 'Emisa' || r.status === 'Marcata'
                      ? `facturat ${r.factura_fgo ?? ''}`.trim()
                      : null,
                    r.status === 'Eroare' ? `eroare: ${r.eroare_mesaj}` : null,
                    r.status === 'Ignorata' ? 'ignorat' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PlataNouaModal
        open={!!plataFor}
        onClose={() => setPlataFor(null)}
        defaultClientId={plataFor?.clientId}
        defaultSuma={plataFor?.suma}
        defaultMetoda="Transfer"
        onRecorded={(linii) => {
          if (plataFor) savePlata.mutate({ ref: plataFor.ref, linii })
        }}
      />

      {facturaFor && (
        <FacturaDialog
          key={facturaFor.row.ref}
          row={facturaFor.row}
          match={facturaFor.match}
          onClose={() => setFacturaFor(null)}
        />
      )}

      {marcheazaFor && (
        <MarcheazaDialog
          key={marcheazaFor.ref}
          row={marcheazaFor}
          onClose={() => setMarcheazaFor(null)}
        />
      )}
    </div>
  )
}
