import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { ClientiAlocati } from './ClientiAlocati'
import { FacturaDialog } from './FacturaDialog'
import { MarcheazaDialog } from './MarcheazaDialog'
import {
  ISTORIC_PAGE_SIZE,
  ignoraFacturi,
  ingestExtras,
  listBancaIstoric,
  listBancaWorklist,
  salveazaPlataBanca,
  saveAlocari,
  searchClienti,
} from './api'
import { platitLegacy, restNealocat } from './alocari'
import type { Alocare, FacturaLinie, FacturaRow } from './types'

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

  const [error, setError] = useState<string | null>(null)
  const [plataFor, setPlataFor] = useState<{
    ref: string
    clientId: string
    suma?: number
  } | null>(null)
  const [facturaFor, setFacturaFor] = useState<FacturaRow | null>(null)
  const [marcheazaFor, setMarcheazaFor] = useState<FacturaRow | null>(null)

  const pending = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'worklist'],
    queryFn: () => listBancaWorklist(),
  })
  const [istoricPage, setIstoricPage] = useState(0)
  const recent = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'istoric', istoricPage],
    queryFn: () => listBancaIstoric(istoricPage),
    placeholderData: keepPreviousData,
  })
  const istoric = recent.data?.rows ?? []
  const istoricTotal = recent.data?.total ?? 0
  const istoricPages = Math.max(1, Math.ceil(istoricTotal / ISTORIC_PAGE_SIZE))

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
    mutationFn: (v: { ref: string; clientId: string; linii: FacturaLinie[] }) =>
      salveazaPlataBanca(v.ref, v.clientId, v.linii),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la marcarea plății.')),
  })

  const saveAloc = useMutation({
    mutationFn: (v: { ref: string; alocari: Alocare[] }) => saveAlocari(v.ref, v.alocari),
    // Alegerea clientului era instant (state local); o ținem instant și acum, cu rollback
    // la eroare. Ordinea rândurilor e stabilă: STABLE_ORDER nu depinde de ce scriem aici.
    onMutate: async (v) => {
      const key = ['facturi-fgo', 'banca', 'worklist']
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<FacturaRow[]>(key)
      queryClient.setQueryData<FacturaRow[]>(key, (old) =>
        (old ?? []).map((r) => (r.ref === v.ref ? { ...r, alocari: v.alocari } : r)),
      )
      return { prev, key }
    },
    onError: (e: unknown, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.key, ctx.prev)
      setError(humanizeError(e, 'Eroare la salvarea clienților.'))
    },
    onSettled: invalidate,
  })

  // Plata înregistrată se atribuie clientului din formular, nu celui de la deschiderea
  // modalului: selectorul de cursant rămâne editabil, deci recepția poate corecta acolo.
  const onPlataRecorded = async (ref: string, linii: FacturaLinie[], clientId: string) => {
    const row = (pending.data ?? []).find((r) => r.ref === ref)
    const alocari = row?.alocari ?? []
    if (row && !alocari.some((a) => a.client_id === clientId)) {
      const [c] = await searchClienti(clientId)
      if (c) {
        await saveAlocari(ref, [
          ...alocari,
          { client_id: c.id, familia_id: c.familia_id, nume: c.nume },
        ])
      }
    }
    savePlata.mutate({ ref, clientId, linii })
  }

  // defaultSuma = restul nealocat, ca al doilea frate să nu pornească de la suma întreagă.
  // `undefined` (nu 0) când nu mai e rest: DatoriiUnificateTab tratează 0 ca „plătește tot".
  const openPlata = (r: FacturaRow, clientId: string) => {
    const rest = restNealocat(r)
    setPlataFor({ ref: r.ref, clientId, suma: rest > 0.004 ? rest : undefined })
  }

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
        className: 'min-w-[240px]',
        cell: (r) => (
          <ClientiAlocati
            row={r}
            showPlata={(r.alocari ?? []).length > 1 && !platitLegacy(r)}
            onChange={(alocari) => saveAloc.mutate({ ref: r.ref, alocari })}
            onPlata={(a) => openPlata(r, a.client_id)}
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
          const alocari = r.alocari ?? []
          const facturat = isFacturat(r)
          // Un singur beneficiar → butonul rămâne aici, unde a fost dintotdeauna. Cu mai
          // mulți, fiecare își are butonul lângă chip (în coloana „Client în CRM").
          const unSingur = alocari.length <= 1 && !platitLegacy(r) && !r.platit_la
          return (
            <div className="flex flex-wrap items-center gap-2">
              {unSingur && (
                <Button
                  variant="secondary"
                  disabled={alocari.length === 0}
                  title={
                    alocari.length
                      ? 'Plată nouă (Transfer) pre-completată cu clientul și suma'
                      : 'Alege întâi clientul din CRM'
                  }
                  onClick={() => alocari[0] && openPlata(r, alocari[0].client_id)}
                >
                  💳 Plată
                </Button>
              )}
              {!facturat && (
                <Button variant="secondary" onClick={() => setFacturaFor(r)}>
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
    [ignoraOne, saveAloc],
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
            explicatie="Nici plata înregistrată (sau doar parțial), nici factura emisă — de făcut amândouă."
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

      {istoricTotal > 0 && (
        <details className="rounded-2xl border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Istoric ({istoricTotal})
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {istoric.map((r) => (
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
          {istoricPages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted">
              <span>
                Pagina {istoricPage + 1} din {istoricPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={istoricPage === 0 || recent.isFetching}
                  onClick={() => setIstoricPage((p) => Math.max(0, p - 1))}
                >
                  ← Anterior
                </Button>
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={istoricPage + 1 >= istoricPages || recent.isFetching}
                  onClick={() => setIstoricPage((p) => p + 1)}
                >
                  Următor →
                </Button>
              </div>
            </div>
          )}
        </details>
      )}

      <PlataNouaModal
        key={plataFor ? `${plataFor.ref}:${plataFor.clientId}` : 'inchis'}
        open={!!plataFor}
        onClose={() => setPlataFor(null)}
        defaultClientId={plataFor?.clientId}
        defaultSuma={plataFor?.suma}
        defaultMetoda="Transfer"
        onRecorded={(linii, clientId) => {
          if (plataFor) void onPlataRecorded(plataFor.ref, linii, clientId)
        }}
      />

      {facturaFor && (
        <FacturaDialog
          key={facturaFor.ref}
          row={facturaFor}
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
