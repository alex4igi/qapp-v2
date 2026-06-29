import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { ClientMatcher } from './ClientMatcher'
import {
  emiteFacturi,
  ignoraFacturi,
  ingestExtras,
  listFacturi,
  marcheazaFacturi,
  type EmitItem,
  type MarkItem,
} from './api'
import type { EmitResult, FacturaRow, MatchSuggestion } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type RowState = { selected: boolean; descriere: string; match: MatchSuggestion | null }

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

  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<EmitResult[] | null>(null)

  const pending = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'pending'],
    queryFn: () => listFacturi('banca', ['Pending']),
  })
  const recent = useQuery({
    queryKey: ['facturi-fgo', 'banca', 'recent'],
    queryFn: () => listFacturi('banca', ['Emisa', 'Marcata', 'Eroare', 'Ignorata']),
  })

  const rows = pending.data ?? []
  const st = (r: FacturaRow): RowState =>
    rowState[r.ref] ?? { selected: !r.client_id, descriere: r.descriere ?? '', match: null }

  const patch = (ref: string, p: Partial<RowState>) =>
    setRowState((prev) => ({
      ...prev,
      [ref]: { ...(prev[ref] ?? { selected: true, descriere: '', match: null }), ...p },
    }))

  const ingest = useMutation({
    mutationFn: async (csv: string) => ingestExtras(csv),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la încărcare.')),
  })

  const onFile = async (file: File) => {
    setError(null)
    setReport(null)
    try {
      const csv = await readCsv(file)
      ingest.mutate(csv)
    } catch (e) {
      setError(humanizeError(e, 'Nu am putut citi fișierul.'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const selectedRows = rows.filter((r) => st(r).selected)

  const emit = useMutation({
    mutationFn: async () => {
      const byFirma = new Map<string, EmitItem[]>()
      for (const r of selectedRows) {
        const s = st(r)
        const list = byFirma.get(r.firma_cui) ?? []
        list.push({
          ref: r.ref,
          client_nume: r.client_nume,
          suma: r.suma,
          data: r.data_tranzactie,
          descriere: s.descriere || r.descriere || '',
          valuta: r.valuta,
          client_id: s.match?.tip === 'client' ? s.match.id : null,
          familia_id:
            s.match?.tip === 'familie' ? s.match.id : s.match?.familia_id ?? null,
        })
        byFirma.set(r.firma_cui, list)
      }
      const all: EmitResult[] = []
      for (const [cui, items] of byFirma) {
        const res = await emiteFacturi(cui, items)
        all.push(...res.results)
      }
      return all
    },
    onSuccess: (res) => {
      setReport(res)
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la emitere.')),
  })

  const ignora = useMutation({
    mutationFn: () => ignoraFacturi(selectedRows.map((r) => r.ref)),
    onSuccess: () => {
      setReport(null)
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la ignorare.')),
  })

  const marcheaza = useMutation({
    mutationFn: async () => {
      const byFirma = new Map<string, MarkItem[]>()
      for (const r of selectedRows) {
        const s = st(r)
        const list = byFirma.get(r.firma_cui) ?? []
        list.push({
          ref: r.ref,
          client_nume: r.client_nume,
          suma: r.suma,
          data: r.data_tranzactie,
          descriere: s.descriere || r.descriere || '',
        })
        byFirma.set(r.firma_cui, list)
      }
      const all: EmitResult[] = []
      for (const [cui, items] of byFirma) {
        const res = await marcheazaFacturi(cui, items)
        all.push(...res.results)
      }
      return all
    },
    onSuccess: (res) => {
      setReport(res)
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la marcare.')),
  })

  const totalSelected = selectedRows.reduce((s, r) => s + r.suma, 0)

  const columns: Column<FacturaRow>[] = useMemo(
    () => [
      {
        header: '',
        className: 'w-8',
        cell: (r) => (
          <input
            type="checkbox"
            checked={st(r).selected}
            onChange={(e) => patch(r.ref, { selected: e.target.checked })}
          />
        ),
      },
      { header: 'Data', cell: (r) => r.data_tranzactie, sortValue: (r) => r.data_tranzactie },
      { header: 'Plătitor', cell: (r) => r.client_nume, sortValue: (r) => r.client_nume },
      {
        header: 'Client în CRM',
        className: 'min-w-[220px]',
        cell: (r) => (
          <ClientMatcher
            payerNume={r.client_nume}
            descriere={r.descriere ?? ''}
            value={st(r).match}
            onChange={(m) => patch(r.ref, { match: m })}
          />
        ),
      },
      {
        header: 'Descriere factură',
        className: 'min-w-[200px]',
        cell: (r) => (
          <input
            type="text"
            value={st(r).descriere}
            onChange={(e) => patch(r.ref, { descriere: e.target.value })}
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-line focus:border-quasar-yellow focus:outline-none"
          />
        ),
      },
      {
        header: 'Sumă',
        className: 'text-right whitespace-nowrap',
        cell: (r) => `${fmt(r.suma)} ${r.valuta}`,
        sortValue: (r) => r.suma,
      },
    ],
    [rowState, rows],
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

      {report && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Rezultat</p>
          <ul className="space-y-1 text-sm">
            {report.map((r) => (
              <li key={r.ref}>
                <span
                  className={
                    r.status === 'eroare' ? 'text-red-700' : 'text-green-700'
                  }
                >
                  {r.status === 'emisa'
                    ? `✓ ${r.client} — ${r.factura}`
                    : r.status === 'marcata'
                      ? `✓ ${r.client} — marcată`
                      : `✗ ${r.client} — ${r.mesaj}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending.isLoading ? (
        <Spinner />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.ref}
            emptyMessage="Nicio încasare de procesat. Încarcă un extras de cont."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">
              {selectedRows.length} selectate · {fmt(totalSelected)} RON
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={selectedRows.length === 0 || ignora.isPending}
                onClick={() => ignora.mutate()}
                title="Scoate rândurile din listă (transferuri care nu se facturează). Rămân în registru — nu se mai propun din nou."
              >
                Ignoră
              </Button>
              <Button
                variant="secondary"
                disabled={selectedRows.length === 0 || marcheaza.isPending}
                onClick={() => marcheaza.mutate()}
                title="Pentru încasări facturate deja manual în FGO — intră în registru fără emitere"
              >
                Marchează ca facturate
              </Button>
              <Button
                disabled={selectedRows.length === 0 || emit.isPending}
                onClick={() => emit.mutate()}
              >
                {emit.isPending ? 'Se emit…' : 'Emite facturile în FGO'}
              </Button>
            </div>
          </div>
        </>
      )}

      {(recent.data ?? []).length > 0 && (
        <details className="rounded-2xl border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Istoric recent ({(recent.data ?? []).length})
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {(recent.data ?? []).slice(0, 50).map((r) => (
              <li key={r.ref} className="flex justify-between gap-3">
                <span className="text-ink">
                  {r.data_tranzactie} · {r.client_nume} · {fmt(r.suma)} RON
                </span>
                <span
                  className={
                    r.status === 'Eroare' ? 'text-red-700' : 'text-muted'
                  }
                >
                  {r.status === 'Eroare'
                    ? `eroare: ${r.eroare_mesaj}`
                    : r.status === 'Ignorata'
                      ? 'ignorată'
                      : r.factura_fgo}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
