import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, MonthPicker, Spinner, type Column } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { humanizeError } from '@/lib/errorMessage'
import { getRaportNetopia, importaDecont, type RaportPlata } from './raport-netopia/api'
import { citesteFisiereDecont } from './raport-netopia/parseDecont'
import { descarcaRaportNetopiaPdf } from './raport-netopia/pdfRaportNetopia'
import {
  dataRo,
  etichetaLuna,
  lei,
  netPlata,
  tipPlata,
  totaluri,
  verificari,
} from './raport-netopia/calcul'

function lunaTrecuta(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function RaportNetopiaTab() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [luna, setLuna] = useState(lunaTrecuta)
  const [importError, setImportError] = useState<string | null>(null)

  const raport = useQuery({
    queryKey: ['raport-netopia', luna],
    queryFn: () => getRaportNetopia(luna),
  })

  const incarca = useMutation({
    mutationFn: async (files: File[]) => importaDecont(await citesteFisiereDecont(files)),
    onMutate: () => setImportError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['raport-netopia'] }),
    onError: (e: unknown) => setImportError(humanizeError(e, 'Fișierele nu au putut fi încărcate.')),
    meta: { erroareAfisata: true },
  })

  const pdf = useMutation({ mutationFn: descarcaRaportNetopiaPdf })

  const r = raport.data
  const t = r ? totaluri(r) : null
  const ver = r ? verificari(r) : []

  const exportCsv = () => {
    if (!r) return
    downloadCsv(
      `plati-netopia-${luna}.csv`,
      ['Data', 'Ora', 'Platitor', 'Pentru', 'Ce s-a platit', 'Tip', 'Comanda', 'Factura FGO',
        'Facturat catre', 'Suma', 'Comision', 'Net', 'Lot Netopia', 'Data virarii'],
      r.plati.map((p) => [
        dataRo(p.data), p.ora, p.platitor, p.membru, p.descriere, tipPlata(p), p.order_ref,
        p.factura, p.facturat_catre, p.suma.toFixed(2),
        p.batch_id != null ? ((p.comision ?? 0) + (p.tva_comision ?? 0)).toFixed(2) : '',
        netPlata(p)?.toFixed(2) ?? '', p.batch_id, p.data_virare ? dataRo(p.data_virare) : '',
      ]),
    )
  }

  const columns: Column<RaportPlata>[] = [
    {
      header: 'Data',
      cell: (p) => (
        <span className="whitespace-nowrap">
          {dataRo(p.data)} <span className="text-muted">{p.ora}</span>
        </span>
      ),
      sortValue: (p) => `${p.data} ${p.ora}`,
    },
    { header: 'Plătitor', cell: (p) => p.platitor ?? '—', sortValue: (p) => p.platitor ?? '' },
    { header: 'Pentru', cell: (p) => p.membru ?? '—', sortValue: (p) => p.membru ?? '' },
    {
      header: 'Ce s-a plătit',
      cell: (p) => (
        <span>
          {p.descriere}
          <span className="block text-xs text-muted">{tipPlata(p)}</span>
        </span>
      ),
    },
    {
      header: 'Factură',
      cell: (p) =>
        p.factura && p.factura_status === 'Emisa' ? (
          p.factura_link ? (
            <a href={p.factura_link} target="_blank" rel="noreferrer" className="whitespace-nowrap text-green-700 underline">
              {p.factura}
            </a>
          ) : (
            p.factura
          )
        ) : (
          <span className="font-medium text-red-700">fără factură</span>
        ),
      sortValue: (p) => p.factura ?? '',
    },
    {
      header: 'Sumă',
      className: 'text-right whitespace-nowrap',
      cell: (p) => `${lei(p.suma)} lei`,
      sortValue: (p) => p.suma,
    },
    {
      header: 'Comision',
      className: 'text-right whitespace-nowrap',
      cell: (p) => (p.batch_id != null ? lei((p.comision ?? 0) + (p.tva_comision ?? 0)) : '—'),
    },
    {
      header: 'Virat',
      className: 'whitespace-nowrap',
      cell: (p) =>
        p.batch_id != null ? (
          dataRo(p.data_virare)
        ) : (
          <span className="text-xs text-muted">încă nu</span>
        ),
      sortValue: (p) => p.data_virare ?? '',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">Raport lunar pentru contabilitate</p>
            <p className="text-xs text-muted">
              Toate plățile online din lună: cine a plătit, pentru cine, suma, factura FGO, comisionul
              Netopia și când au intrat banii în cont.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <MonthPicker value={luna} onChange={setLuna} />
            </div>
            <Button variant="secondary" onClick={exportCsv} disabled={!r || r.plati.length === 0}>
              Export Excel (CSV)
            </Button>
            <Button onClick={() => r && pdf.mutate(r)} disabled={!r || pdf.isPending}>
              {pdf.isPending ? 'Se generează…' : 'Descarcă PDF'}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm font-semibold text-ink">Fișierele de decont Netopia</p>
            <p className="text-xs text-muted">
              Din panoul Netopia, descarcă fișierele loturilor virate (batchId….csv.zip) și încarcă-le aici —
              merge și arhiva întreagă, cu toate loturile deodată. Din ele vin comisioanele și data virării.
              Un lot încărcat a doua oară se înlocuiește, nu se dublează.
              {r?.ultim_lot && (
                <>
                  {' '}
                  Ultimul lot încărcat: <strong>{dataRo(r.ultim_lot)}</strong>.
                </>
              )}
            </p>
          </div>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={incarca.isPending}>
            {incarca.isPending ? 'Se încarcă…' : 'Încarcă fișiere Netopia'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.csv,application/zip,text/csv"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) incarca.mutate(files)
            }}
          />
        </div>
        {incarca.data && (
          <p className="mt-3 text-sm text-ink">
            ✓ {incarca.data.loturi} {incarca.data.loturi === 1 ? 'lot încărcat' : 'loturi încărcate'} ·{' '}
            {incarca.data.linii} linii
          </p>
        )}
        {importError && <p className="mt-3 text-sm text-red-700">{importError}</p>}
      </div>

      {raport.isLoading ? (
        <Spinner />
      ) : raport.error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {humanizeError(raport.error, 'Raportul nu a putut fi încărcat.')}
        </div>
      ) : r && t ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi valoare={String(t.nrPlati)} eticheta={`plăți online în ${etichetaLuna(luna)}`} />
            <Kpi valoare={`${lei(t.incasat)} lei`} eticheta="încasat (brut)" />
            <Kpi valoare={`${t.nrFacturate} / ${t.nrPlati}`} eticheta="cu factură FGO" />
            <Kpi
              valoare={t.nrDecontate ? `${lei(Math.abs(t.comisioane))} lei` : '—'}
              eticheta={
                t.nrDecontate < t.nrPlati
                  ? `comisioane (${t.nrDecontate} din ${t.nrPlati} plăți virate)`
                  : 'comisioane Netopia'
              }
            />
          </div>

          {ver.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-900">De verificat înainte de trimitere</p>
              <ul className="list-disc space-y-1 pl-5">
                {ver.map((v, i) => (
                  <li key={i} className={v.nivel === 'atentie' ? 'text-red-800' : 'text-amber-900'}>
                    {v.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DataTable
            columns={columns}
            rows={r.plati}
            rowKey={(p) => p.order_ref}
            emptyMessage={`Nicio plată online în ${etichetaLuna(luna)}.`}
          />
        </>
      ) : null}
    </div>
  )
}

function Kpi({ valoare, eticheta }: { valoare: string; eticheta: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-lg font-semibold text-ink">{valoare}</div>
      <div className="text-xs text-muted">{eticheta}</div>
    </div>
  )
}
