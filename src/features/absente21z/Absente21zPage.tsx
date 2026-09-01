import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, DataTable, Badge, Button, Tabs, type Column } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getWorklistAbsente } from './api'
import { ContactAbsentaModal } from './ContactAbsentaModal'
import { urgenta, type CazAbsenta } from './types'

const TON: Record<ReturnType<typeof urgenta>, { tone: 'neutral' | 'warn' | 'danger' | 'success'; label: string }> = {
  verde:     { tone: 'success', label: 'nou' },
  galben:    { tone: 'warn',    label: 'peste 24h' },
  rosu:      { tone: 'danger',  label: 'peste 48h' },
  contactat: { tone: 'neutral', label: 'contactat' },
}

export default function Absente21zPage() {
  const { locatieId } = useWorkingLocatie()
  const [tab, setTab] = useState<'de_sunat' | 'istoric'>('de_sunat')
  const [caz, setCaz] = useState<CazAbsenta | null>(null)

  const locatii = useMemo(
    () => (locatieId && locatieId !== '__ALL__' ? [locatieId] : null),
    [locatieId],
  )

  const q = useQuery({
    queryKey: ['absente-21z', locatii],
    queryFn: () => getWorklistAbsente(locatii),
    staleTime: 60_000,
  })

  const toate = q.data ?? []
  const deSunat = toate.filter((c) => !c.contactat_la)
  const randuri = tab === 'de_sunat' ? deSunat : toate.filter((c) => c.contactat_la)
  const depasite = deSunat.filter((c) => c.ore_de_la_intrare >= 48).length

  const columns: Column<CazAbsenta>[] = [
    {
      header: 'Cursant',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.client_nume}</div>
          <div className="text-xs text-quasar-gray">
            {r.curs_nume}
            {r.telefon && ` · ${r.telefon}`}
          </div>
        </div>
      ),
      sortValue: (r) => r.client_nume,
    },
    {
      header: 'Tăcere',
      cell: (r) => (
        <div>
          <div>{r.zile_tacere} zile</div>
          <div className="text-xs text-quasar-gray">
            {r.ultima_prezenta ? `ultima: ${r.ultima_prezenta}` : 'nu a venit niciodată'}
          </div>
        </div>
      ),
      sortValue: (r) => r.zile_tacere,
      defaultDir: 'desc',
    },
    {
      header: 'În listă de',
      cell: (r) => {
        const u = urgenta(r)
        return (
          <div className="flex items-center gap-2">
            <Badge tone={TON[u].tone}>{TON[u].label}</Badge>
            {!r.contactat_la && (
              <span className="text-xs text-quasar-gray">
                {Math.floor(r.ore_de_la_intrare)}h
              </span>
            )}
          </div>
        )
      },
      sortValue: (r) => r.ore_de_la_intrare,
      defaultDir: 'desc',
    },
    {
      header: 'Motiv',
      cell: (r) => r.motiv ?? <span className="text-quasar-gray">—</span>,
      sortValue: (r) => r.motiv ?? '',
    },
    {
      header: 'Rezultat',
      cell: (r) =>
        r.reactivat == null ? (
          <span className="text-xs text-quasar-gray">fereastră deschisă</span>
        ) : r.reactivat ? (
          <Badge tone="success">reactivat {r.reactivat_la}</Badge>
        ) : (
          <Badge tone="neutral">nereactivat</Badge>
        ),
      sortValue: (r) => (r.reactivat == null ? 0 : r.reactivat ? 2 : 1),
    },
    {
      header: '',
      cell: (r) =>
        r.contactat_la ? (
          <span className="text-xs text-quasar-gray">{r.contactat_la.slice(0, 16).replace('T', ' ')}</span>
        ) : (
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              setCaz(r)
            }}
          >
            📞 Contactat
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Absenți de 21 de zile"
        subtitle="Cursanți care au încetat să vină. Fiecare caz trebuie contactat în maximum 48 de ore."
      />

      {depasite > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <strong>{depasite}</strong>{' '}
          {depasite === 1 ? 'caz a depășit' : 'cazuri au depășit'} termenul de 48 de ore.
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'de_sunat', label: `De contactat (${deSunat.length})` },
          { id: 'istoric', label: `Istoric (${toate.length - deSunat.length})` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      <div className="mt-4">
        {q.isLoading ? (
          <p className="text-sm text-quasar-gray">Se încarcă…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={randuri}
            rowKey={(r) => r.id}
            defaultSort={{ idx: 2, dir: 'desc' }}
            emptyMessage={
              tab === 'de_sunat'
                ? 'Niciun caz de contactat. Lista se completează automat în fiecare dimineață.'
                : 'Niciun caz contactat încă.'
            }
            rowClassName={(r) =>
              !r.contactat_la && r.ore_de_la_intrare >= 48 ? 'bg-red-50/60' : undefined
            }
          />
        )}
      </div>

      <ContactAbsentaModal open={caz != null} caz={caz} onClose={() => setCaz(null)} />
    </>
  )
}
