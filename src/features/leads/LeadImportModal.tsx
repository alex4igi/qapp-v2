import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Button,
  Field,
  Select,
  Checkbox,
  Badge,
  Spinner,
  DataTable,
  type Column,
} from '@/components/ui'
import { campaniiOptions } from '@/lib/lookups'
import { downloadCsv } from '@/lib/csv'
import { LOCATII } from './constants'
import {
  readCsvTable,
  autoMapColumns,
  buildRows,
  markDuplicates,
  FIELD_OPTIONS,
  type CsvTable,
  type ColumnMapping,
  type ParsedLeadRow,
} from './leadImport'
import { findExistingLeadPhones, bulkImportLeads } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

const TEMPLATE_HEADERS = [
  'Nume',
  'Prenume',
  'Telefon',
  'Email',
  'Interes',
  'Grupa',
  'Observatii',
]

const STATUS_BADGE: Record<
  ParsedLeadRow['status'],
  { tone: 'success' | 'warn' | 'neutral'; label: string }
> = {
  ok: { tone: 'success', label: 'OK' },
  duplicat: { tone: 'neutral', label: 'Duplicat' },
  invalid: { tone: 'warn', label: 'Invalid' },
}

const MAP_OPTIONS = [
  { value: '', label: '— ignoră —' },
  ...FIELD_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
]

export function LeadImportModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [table, setTable] = useState<CsvTable | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [rows, setRows] = useState<ParsedLeadRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [deduping, setDeduping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ inserted: number } | null>(null)

  const [sursa, setSursa] = useState('')
  const [locatia, setLocatia] = useState('')

  const campanii = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
    enabled: open,
  })

  const counts = useMemo(() => {
    const sel = rows.filter((r) => r.selected && r.status !== 'invalid')
    return {
      total: rows.length,
      selected: sel.length,
      duplicate: rows.filter((r) => r.status === 'duplicat').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
    }
  }, [rows])

  const hasNume = mapping.includes('nume')
  const hasTelefon = mapping.includes('telefon')

  const reset = () => {
    setTable(null)
    setMapping([])
    setRows([])
    setFileName(null)
    setError(null)
    setReport(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // (Re)construiește preview-ul din mapare + rulează dedup pe telefoanele valide.
  const applyMapping = async (t: CsvTable, m: ColumnMapping) => {
    setDeduping(true)
    try {
      const base = buildRows(t, m)
      const phones = base
        .filter((r) => r.telefonValid && r.telefon)
        .map((r) => r.telefon!)
      const existing = phones.length
        ? await findExistingLeadPhones(phones)
        : new Set<string>()
      setRows(markDuplicates(base, existing))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la verificarea duplicatelor.')
    } finally {
      setDeduping(false)
    }
  }

  const onFile = async (file: File) => {
    setError(null)
    setReport(null)
    setParsing(true)
    try {
      const text = await file.text()
      const { table: t, error: err } = readCsvTable(text)
      if (err || !t) {
        reset()
        setError(err)
        return
      }
      const m = autoMapColumns(t.headers)
      setTable(t)
      setMapping(m)
      setFileName(file.name)
      await applyMapping(t, m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nu am putut citi fișierul.')
    } finally {
      setParsing(false)
    }
  }

  const changeMapping = (colIdx: number, value: string) => {
    if (!table) return
    const m = mapping.slice()
    m[colIdx] = value as ColumnMapping[number]
    setMapping(m)
    void applyMapping(table, m)
  }

  const toggleRow = (idx: number) =>
    setRows((prev) =>
      prev.map((r) =>
        r.idx === idx && r.status !== 'invalid'
          ? { ...r, selected: !r.selected }
          : r,
      ),
    )

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = rows.filter((r) => r.selected && r.status !== 'invalid')
      return bulkImportLeads(
        selected.map((r) => ({
          nume: r.nume,
          prenume: r.prenume,
          nume_parinte: r.nume_parinte,
          telefon: r.telefon,
          email: r.email,
          interes: r.interes,
          grupa_varsta: r.grupa_varsta,
          observatii: r.observatii,
        })),
        { sursa: sursa || null, locatia: locatia || null },
      )
    },
    onSuccess: (res) => {
      setReport(res)
      setTable(null)
      setMapping([])
      setRows([])
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la import.'),
  })

  const downloadTemplate = () =>
    downloadCsv('sablon-import-leads.csv', TEMPLATE_HEADERS, [
      ['Popescu', 'Maria', '0740123456', 'maria@exemplu.ro', 'Street Dance', 'Junior', ''],
    ])

  const columns: Column<ParsedLeadRow>[] = [
    {
      header: '',
      className: 'w-8',
      cell: (r) => (
        <Checkbox
          id={`imp-${r.idx}`}
          label=""
          checked={r.selected}
          disabled={r.status === 'invalid'}
          onChange={() => toggleRow(r.idx)}
        />
      ),
    },
    {
      header: 'Status',
      cell: (r) => (
        <Badge tone={STATUS_BADGE[r.status].tone}>
          {STATUS_BADGE[r.status].label}
        </Badge>
      ),
    },
    {
      header: 'Nume',
      cell: (r) => [r.prenume, r.nume].filter(Boolean).join(' ') || '—',
      sortValue: (r) => r.nume,
    },
    { header: 'Telefon', cell: (r) => r.telefon ?? '—' },
    { header: 'Email', cell: (r) => r.email ?? '—' },
    { header: 'Interes', cell: (r) => r.interes ?? '—' },
    { header: 'Grupă', cell: (r) => r.grupa_varsta ?? '—' },
    {
      header: 'Observații',
      className: 'min-w-[160px]',
      cell: (r) =>
        r.warnings.length > 0 ? (
          <span className="text-xs text-warn">{r.warnings.join(' · ')}</span>
        ) : (
          <span className="text-xs text-muted">{r.observatii ?? ''}</span>
        ),
    },
  ]

  const canImport =
    counts.selected > 0 && Boolean(sursa) && !importMut.isPending && !deduping

  return (
    <Modal
      open={open}
      title="Import leaduri din CSV"
      onClose={handleClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Închide
          </Button>
          {table && (
            <Button disabled={!canImport} onClick={() => importMut.mutate()}>
              {importMut.isPending
                ? 'Se importă…'
                : `Importă ${counts.selected} lead${counts.selected === 1 ? '' : 'uri'}`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Upload */}
        <div className="rounded-2xl border border-dashed border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Încarcă un fișier CSV
              </p>
              <p className="text-xs text-muted">
                Orice denumiri/ordine de coloane — potrivirea se face mai jos.
                Leadurile importate nu primesc SMS.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-sm text-quasar-gray underline hover:text-ink"
              >
                Descarcă șablon
              </button>
              <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
                {parsing ? 'Se procesează…' : 'Alege fișier CSV'}
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
          </div>
          {fileName && (
            <p className="mt-3 text-sm text-ink">
              <strong>{fileName}</strong> · {counts.total} rânduri ·{' '}
              {counts.selected} de importat
              {counts.duplicate > 0 && ` · ${counts.duplicate} duplicate`}
              {counts.invalid > 0 && ` · ${counts.invalid} invalide`}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {report && (
          <div className="rounded-xl bg-success-bg px-4 py-3 text-sm text-success">
            ✓ {report.inserted} lead
            {report.inserted === 1 ? '' : 'uri'} importate în coloana „Nou".
          </div>
        )}

        {parsing && <Spinner />}

        {table && (
          <>
            {/* Mapare coloane: fiecare coloană din fișier → câmp intern */}
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="mb-2 text-sm font-semibold text-ink">
                Potrivește coloanele
              </p>
              <p className="mb-3 text-xs text-muted">
                Am ghicit potrivirea după antet. Corectează unde e nevoie sau pune
                „ignoră" pentru coloanele care nu trebuie importate.
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {table.headers.map((h, i) => (
                  <div key={`${h}-${i}`}>
                    <p
                      className="mb-1 truncate text-xs font-medium text-ink"
                      title={h}
                    >
                      {h || `Coloana ${i + 1}`}
                    </p>
                    <Select
                      options={MAP_OPTIONS}
                      value={mapping[i] ?? ''}
                      onChange={(e) => changeMapping(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              {!hasNume && !hasTelefon && (
                <p className="mt-3 text-xs text-warn">
                  Potrivește cel puțin o coloană „Nume" sau „Telefon" ca să poți
                  importa.
                </p>
              )}
            </div>

            {/* Setări batch */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sursă (campanie)" required htmlFor="imp-sursa">
                <Select
                  id="imp-sursa"
                  placeholder="— selectează —"
                  options={campanii.data ?? []}
                  value={sursa}
                  onChange={(e) => setSursa(e.target.value)}
                />
              </Field>
              <Field label="Locație preferată" htmlFor="imp-locatia">
                <Select
                  id="imp-locatia"
                  placeholder="— selectează —"
                  options={LOCATII.map((l) => ({ label: l, value: l }))}
                  value={locatia}
                  onChange={(e) => setLocatia(e.target.value)}
                />
              </Field>
            </div>
            {!sursa && (
              <p className="text-xs text-warn">
                Alege o sursă (campanie) ca să poți importa.
              </p>
            )}

            {deduping ? (
              <Spinner />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.idx)}
                emptyMessage="Niciun rând."
              />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
