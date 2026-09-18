import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, PageHeader, Spinner, TextInput } from '@/components/ui'
import { matchesWords } from '@/lib/search'
import type { Lead } from '@/types/db'
import { getLeadById, listLeads, listLeadIdsPrezentiAzi, pruneExpiredLeads } from './api'
import { LeadModal } from './LeadModal'
import { LogContactModal } from './LogContactModal'
import { MotivModal } from './MotivModal'
import { WaitingListModal } from './WaitingListModal'
import type { ModMotiv } from './constants'
import { TodayPanel } from './TodayPanel'
import { InteresBadge } from './Badges'

const MAX_REZULTATE = 40

/**
 * Leads pe telefon = lista de sunat. Kanban-ul (drag-and-drop pe coloane cu
 * scroll orizontal) și bara de filtre nu se pot folosi cu degetul, deci rămân pe
 * desktop; aici păstrăm exact ce se face în mers: cine trebuie sunat azi,
 * căutarea unui lead și logarea contactului.
 */
export function LeadsMobileView({ poateEdita }: { poateEdita: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [logLead, setLogLead] = useState<Lead | null>(null)
  // Pașii care continuă după „am vorbit cu el" — aceleași ca pe desktop, ca
  // recepția să poată închide un apel de pe telefon, nu doar să-l noteze.
  const [motivLead, setMotivLead] = useState<{ lead: Lead; mod: ModMotiv } | null>(null)
  const [waitingLead, setWaitingLead] = useState<Lead | null>(null)
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null)
  const [cauta, setCauta] = useState('')

  // Aceeași cheie ca board-ul de desktop și ca `AgendaAziCard` — cache comun.
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      await pruneExpiredLeads()
      return listLeads()
    },
  })
  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data])
  const prezentiAziQ = useQuery({
    queryKey: ['leads', 'prezenti-azi'],
    queryFn: listLeadIdsPrezentiAzi,
  })

  // Deep-link ?lead=<id> (rosterul grupei / al unui eveniment trimite aici).
  const leadParam = searchParams.get('lead')
  useEffect(() => {
    if (!leadParam) return
    let anulat = false
    const clearParam = () => {
      const next = new URLSearchParams(searchParams)
      next.delete('lead')
      setSearchParams(next, { replace: true })
    }
    const dinLista = leads.find((l) => l.id === leadParam)
    if (dinLista) {
      setEditingLead(dinLista)
      clearParam()
      return
    }
    if (leadsQuery.isLoading) return
    void getLeadById(leadParam).then((l) => {
      if (anulat || !l) return
      setEditingLead(l)
      clearParam()
    })
    return () => {
      anulat = true
    }
  }, [leadParam, leads, leadsQuery.isLoading, searchParams, setSearchParams])

  const termen = cauta.trim()
  const rezultate = useMemo(() => {
    if (termen.length < 2) return []
    return leads
      .filter((l) =>
        matchesWords(
          [l.nume, l.prenume, l.telefon, l.email].filter(Boolean).join(' '),
          termen,
        ),
      )
      .slice(0, MAX_REZULTATE)
  }, [leads, termen])

  return (
    <div>
      <PageHeader
        title="De sunat"
        subtitle="Lead-urile care cer acțiune azi"
        actions={
          poateEdita ? (
            <Button onClick={() => setAddOpen(true)}>+ Lead nou</Button>
          ) : null
        }
      />

      <div className="mb-4">
        <TextInput
          value={cauta}
          onChange={(e) => setCauta(e.target.value)}
          placeholder="Caută lead după nume sau telefon…"
        />
      </div>

      {leadsQuery.isLoading ? (
        <Spinner />
      ) : termen.length >= 2 ? (
        <div className="rounded-2xl border border-line bg-card">
          {rezultate.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">Niciun lead găsit.</p>
          ) : (
            rezultate.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setEditingLead(l)}
                className="flex min-h-14 w-full items-center gap-2 border-b border-line-2 px-3 text-left last:border-0 active:bg-rowhover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {[l.prenume, l.nume].filter(Boolean).join(' ') || '—'}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[l.telefon, l.status].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {l.interes && <InteresBadge interes={l.interes} />}
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <TodayPanel
            leads={leads}
            prezentiAzi={prezentiAziQ.data}
            defaultExpanded
            onLeadClick={(l) => setEditingLead(l)}
            onLogContact={poateEdita ? (l) => setLogLead(l) : undefined}
          />
          <p className="px-1 text-xs text-muted">
            Kanban-ul, filtrele și rapoartele se lucrează de pe desktop.
          </p>
        </>
      )}

      {addOpen && <LeadModal open onClose={() => setAddOpen(false)} />}
      {editingLead && (
        <LeadModal open lead={editingLead} onClose={() => setEditingLead(null)} />
      )}
      {logLead && (
        <LogContactModal
          open
          lead={logLead}
          onClose={() => setLogLead(null)}
          onSchedule={setSchedulingLead}
          onWaitingList={setWaitingLead}
          onMotiv={(lead, mod) => setMotivLead({ lead, mod })}
        />
      )}
      {schedulingLead && (
        <LeadModal
          open
          lead={schedulingLead}
          startScheduling
          onClose={() => setSchedulingLead(null)}
        />
      )}
      {waitingLead && (
        <WaitingListModal
          open
          lead={waitingLead}
          onClose={() => setWaitingLead(null)}
        />
      )}
      {motivLead && (
        <MotivModal
          open
          mod={motivLead.mod}
          lead={motivLead.lead}
          onClose={() => setMotivLead(null)}
        />
      )}
    </div>
  )
}
