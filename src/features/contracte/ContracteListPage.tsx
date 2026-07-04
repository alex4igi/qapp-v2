import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Tabs,
  type Column,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import {
  anuleazaContract,
  getContractEvents,
  getPdfSignedUrl,
  listContracte,
  listDistinctTipuri,
  type ContractRow,
} from './api'
import { CONTRACT_STATUS_LABEL, CONTRACT_TIP_LABEL } from './constants'
import { TrimiteContractModal } from './TrimiteContractModal'
import { TrimiteBulkModal } from './TrimiteBulkModal'
import { SabloaneTab } from './SabloaneTab'

const EVENT_LABEL: Record<string, string> = {
  creat: 'Creat',
  trimis: 'Trimis',
  sms_pus_in_coada: 'SMS pus în coadă',
  email_trimis: 'Email trimis',
  deschis: 'Deschis de client',
  consimtamant: 'Consimțământ e-sign',
  semnat: 'Semnat',
  pdf_generat: 'PDF generat',
  sigilat: 'Sigilat',
  drive_upload: 'Urcat pe Drive',
  gate_semnat: 'Act marcat semnat în reînscrieri',
  reminder: 'Reminder',
  expirat: 'Expirat',
  respins: 'Respins',
  anulat: 'Anulat',
  eroare: 'Eroare',
}

function EventsModal({ contract, onClose }: { contract: ContractRow; onClose: () => void }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ['contract-events', contract.id],
    queryFn: () => getContractEvents(contract.id),
  })
  return (
    <Modal open onClose={onClose} title="Istoric contract" size="lg">
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-2 text-sm">
          {(events ?? []).map((ev) => (
            <li key={ev.id} className="flex items-start gap-3">
              <span className="whitespace-nowrap text-muted-2">
                {new Date(ev.created).toLocaleString('ro-RO')}
              </span>
              <span className="font-medium">{EVENT_LABEL[ev.tip] ?? ev.tip}</span>
              {ev.meta?.ip ? <span className="text-muted-2">IP {String(ev.meta.ip)}</span> : null}
              {ev.meta?.mesaj_eroare ? (
                <span className="text-red-600">{String(ev.meta.mesaj_eroare)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export function ContracteListPage() {
  const { role } = useAuth()
  const canEditSabloane = isAdminOrHigher(role)
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<'contracte' | 'sabloane'>(
    location.pathname.startsWith('/contracte/sabloane') ? 'sabloane' : 'contracte',
  )

  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [tip, setTip] = useState('')
  const [sendOpen, setSendOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [eventsFor, setEventsFor] = useState<ContractRow | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data: tipuriExistente = [] } = useQuery({
    queryKey: ['contract-templates-tipuri'],
    queryFn: listDistinctTipuri,
  })

  const { data: rows, isLoading } = useQuery({
    queryKey: ['contracte', status, tip],
    queryFn: () => listContracte({ status: status || undefined, tip: tip || undefined }),
    enabled: activeTab === 'contracte',
  })

  const anuleaza = useMutation({
    mutationFn: anuleazaContract,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracte'] }),
    onError: (e) => setErr(humanizeError(e)),
  })

  async function openPdf(row: ContractRow) {
    if (row.pdf_drive_link) {
      window.open(row.pdf_drive_link, '_blank')
      return
    }
    if (row.pdf_storage_path) {
      const url = await getPdfSignedUrl(row.pdf_storage_path)
      if (url) window.open(url, '_blank')
    }
  }

  const columns: Column<ContractRow>[] = [
    {
      header: 'Trimis',
      cell: (r) => (r.trimis_la ? new Date(r.trimis_la).toLocaleDateString('ro-RO') : '—'),
      sortValue: (r) => r.trimis_la ?? r.created,
    },
    {
      header: 'Document',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.contract_templates?.nume ?? '—'}</div>
          <div className="text-xs text-muted-2">
            {CONTRACT_TIP_LABEL[r.contract_templates?.tip ?? ''] ?? ''}
          </div>
        </div>
      ),
      sortValue: (r) => r.contract_templates?.nume,
    },
    {
      header: 'Familia',
      cell: (r) => (
        <div>
          <div>{r.familii?.nume_familie ?? '—'}</div>
          {r.clienti && (
            <div className="text-xs text-muted-2">
              {`${r.clienti.nume} ${r.clienti.prenume ?? ''}`.trim()}
            </div>
          )}
        </div>
      ),
      sortValue: (r) => r.familii?.nume_familie,
    },
    {
      header: 'Status',
      cell: (r) => {
        const s = CONTRACT_STATUS_LABEL[r.status] ?? { label: r.status, tone: 'neutral' as const }
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
      sortValue: (r) => r.status,
    },
    {
      header: 'Semnat',
      cell: (r) => (r.semnat_la ? new Date(r.semnat_la).toLocaleString('ro-RO') : '—'),
      sortValue: (r) => r.semnat_la,
    },
    {
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => setEventsFor(r)}>
            Istoric
          </Button>
          {(r.pdf_drive_link || r.pdf_storage_path) && (
            <Button variant="ghost" onClick={() => void openPdf(r)}>
              PDF
            </Button>
          )}
          {['trimis', 'deschis'].includes(r.status) && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Anulezi acest contract? Linkul de semnare devine inutilizabil.')) {
                  anuleaza.mutate(r.id)
                }
              }}
            >
              Anulează
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contracte"
        subtitle="Semnare electronică — trimitere, statusuri, arhivă"
      />

      {canEditSabloane && (
        <Tabs
          tabs={[
            { id: 'contracte', label: 'Contracte' },
            { id: 'sabloane', label: 'Șabloane' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'contracte' | 'sabloane')}
        />
      )}

      {activeTab === 'sabloane' && canEditSabloane ? (
        <SabloaneTab />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Toate statusurile"
              options={Object.entries(CONTRACT_STATUS_LABEL).map(([value, v]) => ({
                value,
                label: v.label,
              }))}
              className="w-44"
            />
            <Select
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="Toate tipurile"
              options={tipuriExistente.map((value) => ({
                value,
                label: CONTRACT_TIP_LABEL[value] ?? value,
              }))}
              className="w-52"
            />
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                Bulk campanie
              </Button>
              <Button onClick={() => setSendOpen(true)}>Trimite contract</Button>
            </div>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          {isLoading ? (
            <Spinner />
          ) : (
            <DataTable
              columns={columns}
              rows={rows ?? []}
              rowKey={(r) => r.id}
              emptyMessage="Niciun contract încă. Trimite primul cu butonul de mai sus."
            />
          )}
        </>
      )}

      {sendOpen && <TrimiteContractModal open onClose={() => setSendOpen(false)} />}
      {bulkOpen && <TrimiteBulkModal open onClose={() => setBulkOpen(false)} />}
      {eventsFor && <EventsModal contract={eventsFor} onClose={() => setEventsFor(null)} />}
    </div>
  )
}
