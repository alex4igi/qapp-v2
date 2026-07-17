import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  Tabs,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import type { Anunt } from '@/types/db'
import { ComposeAnuntModal } from './ComposeAnuntModal'
import { ComposeMesajGrupaModal } from './ComposeMesajGrupaModal'
import { AnuntDetailModal } from './AnuntDetailModal'
import {
  getAnunt,
  listAnunturiPrimite,
  listAnunturiTrimise,
  type AnuntPrimit,
  type AnuntTrimis,
} from './api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type Selected = { anunt: Anunt; mode: 'primit' | 'trimis' }

export function AnunturiPage() {
  const { user, role } = useAuth()
  const uid = user?.id ?? ''

  // Cine poate trimite mesaje către membri (portal): instructor + conducere.
  // Recepția (front_desk) nu — la fel ca gardul din send_anunt_client.
  const canMesajGrupa =
    role === 'teacher' ||
    role === 'manager' ||
    role === 'admin' ||
    role === 'owner'

  const [tab, setTab] = useState<'primite' | 'trimise'>('primite')
  const [composeOpen, setComposeOpen] = useState(false)
  const [mesajGrupaOpen, setMesajGrupaOpen] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)

  // Deep-link din notificare: ?anunt=<id> → deschide detaliul (primit).
  const [searchParams, setSearchParams] = useSearchParams()
  const anuntParam = searchParams.get('anunt')
  useEffect(() => {
    if (!anuntParam) return
    let cancelled = false
    void getAnunt(anuntParam).then((a) => {
      if (cancelled) return
      if (a) setSelected({ anunt: a, mode: 'primit' })
      setSearchParams(
        (prev) => {
          prev.delete('anunt')
          return prev
        },
        { replace: true },
      )
    })
    return () => {
      cancelled = true
    }
  }, [anuntParam, setSearchParams])

  const primiteQ = useQuery({
    queryKey: ['anunturi', 'primite', uid],
    queryFn: () => listAnunturiPrimite(uid),
    enabled: !!uid,
  })

  const trimiseQ = useQuery({
    queryKey: ['anunturi', 'trimise', uid],
    queryFn: () => listAnunturiTrimise(uid),
    enabled: !!uid,
  })

  const primiteCols: Column<AnuntPrimit>[] = [
    {
      header: '',
      cell: (r) =>
        r.read_at == null ? (
          <span className="text-quasar-yellow-dark" title="Necitit">
            ●
          </span>
        ) : null,
      className: 'w-6',
    },
    {
      header: 'Titlu',
      cell: (r) => <span className="font-medium">{r.anunt.titlu}</span>,
      sortValue: (r) => r.anunt.titlu?.toLowerCase(),
    },
    {
      header: 'De la',
      cell: (r) => (
        <span className="text-quasar-gray">{r.anunt.expeditor_email ?? '—'}</span>
      ),
      sortValue: (r) => r.anunt.expeditor_email?.toLowerCase(),
    },
    {
      header: 'Data',
      cell: (r) => (
        <span className="whitespace-nowrap text-quasar-gray">
          {formatDate(r.anunt.created)}
        </span>
      ),
      className: 'w-28',
      sortValue: (r) => r.anunt.created,
    },
  ]

  const trimiseCols: Column<AnuntTrimis>[] = [
    {
      header: 'Titlu',
      cell: (r) => <span className="font-medium">{r.anunt.titlu}</span>,
      sortValue: (r) => r.anunt.titlu?.toLowerCase(),
    },
    {
      header: 'Citit',
      cell: (r) => (
        <span className="text-quasar-gray">
          {r.citite} / {r.anunt.nr_destinatari}
        </span>
      ),
      className: 'w-24',
      sortValue: (r) => r.citite ?? 0,
    },
    {
      header: 'Data',
      cell: (r) => (
        <span className="whitespace-nowrap text-quasar-gray">
          {formatDate(r.anunt.created)}
        </span>
      ),
      className: 'w-28',
      sortValue: (r) => r.anunt.created,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Anunțuri"
        subtitle="Mesaje către echipă, livrate în notificări"
        actions={
          <div className="flex gap-2">
            {canMesajGrupa && (
              <Button
                variant="secondary"
                onClick={() => setMesajGrupaOpen(true)}
              >
                💬 Mesaj către grupă
              </Button>
            )}
            <Button onClick={() => setComposeOpen(true)}>📢 Anunț nou</Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'primite', label: 'Primite' },
          { id: 'trimise', label: 'Trimise' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'primite' | 'trimise')}
      />

      {tab === 'primite' ? (
        primiteQ.isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={primiteCols}
            rows={primiteQ.data ?? []}
            rowKey={(r) => r.anunt.id}
            onRowClick={(r) => setSelected({ anunt: r.anunt, mode: 'primit' })}
            emptyMessage="Niciun anunț primit."
          />
        )
      ) : trimiseQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={trimiseCols}
          rows={trimiseQ.data ?? []}
          rowKey={(r) => r.anunt.id}
          onRowClick={(r) => setSelected({ anunt: r.anunt, mode: 'trimis' })}
          emptyMessage="Niciun anunț trimis încă."
        />
      )}

      {composeOpen && (
        <ComposeAnuntModal open onClose={() => setComposeOpen(false)} />
      )}
      {mesajGrupaOpen && (
        <ComposeMesajGrupaModal open onClose={() => setMesajGrupaOpen(false)} />
      )}
      {selected && (
        <AnuntDetailModal
          anunt={selected.anunt}
          mode={selected.mode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
