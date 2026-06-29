import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  DataTable,
  Spinner,
  TextInput,
  Select,
  type Column,
} from '@/components/ui'
import {
  fetchOptOutList,
  clearOptOut,
  type OptOutListRow,
  type OptOutEntity,
} from './api'
import { matchesWords } from '@/lib/search'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function entityLabel(e: OptOutEntity): string {
  return { client: 'Client', lead: 'Lead', familie: 'Familie' }[e]
}

function profileLink(row: OptOutListRow): string | null {
  switch (row.entity) {
    case 'client':
      return `/clienti/${row.id}`
    case 'familie':
      return `/familii/${row.id}`
    case 'lead':
      return `/leads?lead=${row.id}` // leads list, lead-ul se deschide
    default:
      return null
  }
}

function toCSV(rows: OptOutListRow[]): string {
  const header = ['Entity', 'Nume', 'Email', 'Telefon', 'Motiv', 'Data opt-out']
  const escape = (v: string | null) => {
    const s = (v ?? '').replace(/"/g, '""')
    return /[,"\n]/.test(s) ? `"${s}"` : s
  }
  const lines = rows.map((r) =>
    [
      r.entity,
      r.nume_complet,
      r.email,
      r.telefon,
      r.motiv,
      r.opt_out_la,
    ]
      .map(escape)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function OptOutListPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<'' | OptOutEntity>('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['opt-out-list'],
    queryFn: fetchOptOutList,
  })

  const filtered = useMemo(() => {
    if (!data) return []
    return data.filter((r) => {
      if (entityFilter && r.entity !== entityFilter) return false
      const hay = [r.nume_complet, r.email, r.telefon, r.motiv]
        .filter(Boolean)
        .join(' ')
      return matchesWords(hay, search)
    })
  }, [data, search, entityFilter])

  const revertMut = useMutation({
    mutationFn: (row: OptOutListRow) => clearOptOut(row.entity, row.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['opt-out-list'] }),
  })

  const columns: Column<OptOutListRow>[] = [
    {
      header: 'Tip',
      cell: (r) => (
        <span className="rounded bg-quasar-gray-light px-2 py-0.5 text-xs font-medium">
          {entityLabel(r.entity)}
        </span>
      ),
      className: 'w-24',
      sortValue: (r) => entityLabel(r.entity)?.toLowerCase(),
    },
    {
      header: 'Nume',
      cell: (r) => {
        const link = profileLink(r)
        return link ? (
          <Link
            to={link}
            className="text-quasar-black hover:underline"
          >
            {r.nume_complet}
          </Link>
        ) : (
          <span>{r.nume_complet}</span>
        )
      },
      sortValue: (r) => r.nume_complet?.toLowerCase(),
    },
    {
      header: 'Email',
      cell: (r) => r.email ?? '—',
      sortValue: (r) => r.email?.toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.telefon ?? '—',
      className: 'w-32',
      sortValue: (r) => r.telefon,
    },
    {
      header: 'Motiv',
      cell: (r) => (
        <span className="text-xs text-quasar-gray">{r.motiv ?? '—'}</span>
      ),
      sortValue: (r) => r.motiv?.toLowerCase(),
    },
    {
      header: 'Data',
      cell: (r) => (
        <span className="text-xs text-quasar-gray">
          {formatDate(r.opt_out_la)}
        </span>
      ),
      className: 'w-32',
      sortValue: (r) => r.opt_out_la,
    },
    {
      header: '',
      cell: (r) => (
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            if (
              confirm(
                `Revert opt-out pentru ${r.nume_complet}? Va putea primi din nou comunicare marketing.`,
              )
            ) {
              revertMut.mutate(r)
            }
          }}
          disabled={revertMut.isPending}
        >
          Revert
        </Button>
      ),
      className: 'w-28',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Opt-out comunicare"
        subtitle={
          data
            ? `${filtered.length} / ${data.length} persoane cu opt-out marketing`
            : undefined
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              if (!filtered.length) return
              downloadCSV(
                toCSV(filtered),
                `opt-out-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }}
            disabled={!filtered.length}
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <TextInput
            placeholder="Caută după nume, email, telefon, motiv…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            value={entityFilter}
            onChange={(e) =>
              setEntityFilter(e.target.value as '' | OptOutEntity)
            }
            options={[
              { value: '', label: 'Toate tipurile' },
              { value: 'client', label: 'Clienți' },
              { value: 'lead', label: 'Leads' },
              { value: 'familie', label: 'Familii' },
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {humanizeError(error)}
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-quasar-gray shadow-sm">
          {data?.length === 0
            ? 'Nimeni nu a fost marcat cu opt-out. 🎉'
            : 'Niciun rezultat pentru filtrele aplicate.'}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => `${r.entity}:${r.id}`}
        />
      )}

      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
        <strong>Notă GDPR:</strong> opt-out blochează doar mesajele de tip
        marketing/newsletter (planificate pentru 2027). Mesajele tranzacționale
        (reminder plată, confirmare programare, retenție) continuă să fie
        trimise — interes legitim al școlii (GDPR art. 6 lit. f).
      </div>
    </div>
  )
}
