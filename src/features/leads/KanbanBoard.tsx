import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { campaniiOptions } from '@/lib/lookups'
import type { Lead, StatusLead } from '@/types/db'
import { PIPELINE_COLUMNS, perioadaToRange } from './constants'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'
import { LeadModal } from './LeadModal'
import { LogContactModal } from './LogContactModal'
import { PierdutModal } from './PierdutModal'
import { ContactareModal } from './ContactareModal'
import { WaitingListModal } from './WaitingListModal'
import { ConversieModal, type ConversieResult } from './ConversieModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import {
  LeadFilters,
  applyLeadFilters,
  EMPTY_LEAD_FILTERS,
  STATUSURI_DE_SUNAT,
  type LeadFiltersValue,
} from './LeadFilters'
import { LeadListView } from './LeadListView'
import { NurtureMatchBanner } from './NurtureMatchBanner'
import { TodayPanel } from './TodayPanel'
import {
  getEnrolledClientIds,
  getLatestProgramareCurs,
  lastPrezentaByLead,
  listLeadIdsContactedToday,
  listLeads,
  listNurtureLeads,
  markLeadConvertit,
  pruneExpiredLeads,
  updateLeadStatus,
} from './api'

type PipelineMode = 'kanban' | 'lista'

export function KanbanBoard() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<LeadFiltersValue>(EMPTY_LEAD_FILTERS)
  // Modul e în URL (?mod=lista) ca lista de sunat să poată fi pusă la favorite.
  const mode: PipelineMode =
    searchParams.get('mod') === 'lista' ? 'lista' : 'kanban'
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [addingToStatus, setAddingToStatus] = useState<string | null>(null)
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null)
  const [pierdutLead, setPierdutLead] = useState<Lead | null>(null)
  const [contactareLead, setContactareLead] = useState<Lead | null>(null)
  const [waitingLead, setWaitingLead] = useState<Lead | null>(null)
  const [convertLead, setConvertLead] = useState<Lead | null>(null)
  const [enrollData, setEnrollData] = useState<ConversieResult | null>(null)
  const [logContactLead, setLogContactLead] = useState<Lead | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      await pruneExpiredLeads()
      return listLeads()
    },
  })
  const campaniiQuery = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })

  // Nurture (~6000 ex-clienți) intră în listă doar când e cerut explicit — sau
  // când nu e bifat niciun status, caz în care „toate" chiar înseamnă toate.
  // Intervalul taie server-side, ca presetul implicit să nu aducă tot pool-ul.
  const vreaNurture =
    mode === 'lista' &&
    (filters.statusuri.length === 0 || filters.statusuri.includes('nurture'))
  const nurtureRange = perioadaToRange(filters.perioada)
  const nurtureQuery = useQuery({
    queryKey: ['leads', 'nurture', nurtureRange],
    queryFn: () => listNurtureLeads(nurtureRange),
    enabled: vreaNurture,
  })

  const contactatiAziQuery = useQuery({
    queryKey: ['leads', 'contactate-azi'],
    queryFn: listLeadIdsContactedToday,
    enabled: mode === 'lista',
  })
  const contactatiAzi = useMemo(
    () => new Set(contactatiAziQuery.data ?? []),
    [contactatiAziQuery.data],
  )

  // Prezența la demo se citește din programari_leads doar pentru listă: în
  // Nurture `status` e uniform, deci „a venit / nu a venit" s-ar pierde.
  const prezenteQuery = useQuery({
    queryKey: ['leads', 'prezente'],
    queryFn: lastPrezentaByLead,
    enabled: mode === 'lista',
  })

  function setMode(next: PipelineMode) {
    const params = new URLSearchParams(searchParams)
    if (next === 'lista') params.set('mod', 'lista')
    else params.delete('mod')
    setSearchParams(params, { replace: true })
    // Lista pornește pe cine chiar așteaptă un telefon, nu pe tot istoricul.
    if (next === 'lista' && filters.statusuri.length === 0) {
      setFilters((f) => ({ ...f, statusuri: [...STATUSURI_DE_SUNAT] }))
    }
  }

  const campaniiById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaniiQuery.data ?? []) map.set(c.value, c.label)
    return map
  }, [campaniiQuery.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const leads = leadsQuery.data ?? []

  // Deschidere directă a fișei unui lead via ?lead=<id> (ex: din rosterul grupei).
  // Așteptăm ca lista să fie încărcată, apoi curățăm param-ul din URL.
  const leadParam = searchParams.get('lead')
  useEffect(() => {
    if (!leadParam) return
    const lead = leads.find((l) => l.id === leadParam)
    if (lead) {
      setEditingLead(lead)
      const next = new URLSearchParams(searchParams)
      next.delete('lead')
      setSearchParams(next, { replace: true })
    }
  }, [leadParam, leads, searchParams, setSearchParams])

  // Leads cu client creat dar neconvertiți = înscriere începută, neterminată.
  // Verificăm care dintre clienții lor au deja o înrolare activă, ca să arătăm
  // butonul „Finalizează înscrierea" doar celor care chiar n-au înrolare.
  const pendingClientIds = useMemo(
    () =>
      leads
        .filter((l) => l.id_client && l.status !== 'convertit')
        .map((l) => l.id_client as string),
    [leads],
  )
  const enrolledQuery = useQuery({
    queryKey: ['leads', 'pending-enrolled', [...pendingClientIds].sort()],
    queryFn: () => getEnrolledClientIds(pendingClientIds),
    enabled: pendingClientIds.length > 0,
  })
  const enrolledClientIds = useMemo(
    () => new Set(enrolledQuery.data ?? []),
    [enrolledQuery.data],
  )

  async function handleEnroll(lead: Lead) {
    if (!lead.id_client) return
    const cursId = await getLatestProgramareCurs(lead.id)
    setEnrollData({ clientId: lead.id_client, cursId, leadId: lead.id })
  }

  // Setul de bază al vederii curente. Kanbanul rămâne strict pe pipeline;
  // lista unește pipeline-ul cu Nurture când e cerut.
  const baseLeads = useMemo(
    () => (vreaNurture ? [...leads, ...(nurtureQuery.data ?? [])] : leads),
    [leads, nurtureQuery.data, vreaNurture],
  )

  const filtered = useMemo(
    () => applyLeadFilters(baseLeads, filters),
    [baseLeads, filters],
  )

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StatusLead }) =>
      updateLeadStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] })
      const prev = queryClient.getQueryData<Lead[]>(['leads'])
      queryClient.setQueryData<Lead[]>(['leads'], (old) =>
        old?.map((l) => (l.id === id ? { ...l, status } : l)),
      )
      return { prev }
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['leads'], ctx.prev)
      setDragError(humanizeError(e, 'Eroare la mutare'))
      setTimeout(() => setDragError(null), 5000)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  const activeLead = activeId
    ? leads.find((l) => l.id === activeId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const dragged = leads.find((l) => l.id === active.id)
    if (!dragged) return

    const overId = over.id as string
    const targetColumn = PIPELINE_COLUMNS.find((c) => c.status === overId)
    const overLead = leads.find((l) => l.id === overId)
    const newStatus: StatusLead =
      targetColumn?.status ?? overLead?.status ?? dragged.status

    // Coloane terminale — lead-urile pierdute/convertite nu se mai mută.
    if (dragged.status === 'pierdut' || dragged.status === 'convertit') {
      if (newStatus === dragged.status) return
      setDragError(
        'Lead-urile pierdute sau convertite nu mai pot fi mutate.',
      )
      setTimeout(() => setDragError(null), 5000)
      return
    }

    // Re-drop pe „Programat" (chiar dacă e deja programat) = reprogramare:
    // redeschide modalul, care re-sincronizează programarea în roster.
    if (newStatus === 'programat') {
      setSchedulingLead(dragged)
      return
    }

    if (newStatus === dragged.status) return
    if (newStatus === 'pierdut') {
      setPierdutLead(dragged)
      return
    }
    if (newStatus === 'contactat') {
      setContactareLead(dragged)
      return
    }
    if (newStatus === 'waiting_list') {
      setWaitingLead(dragged)
      return
    }
    if (newStatus === 'convertit') {
      setConvertLead(dragged)
      return
    }
    statusMutation.mutate({ id: dragged.id, status: newStatus })
  }

  if (leadsQuery.isLoading) return <Spinner />
  if (leadsQuery.isError) {
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea lead-urilor:{' '}
        {humanizeError(leadsQuery.error)}
      </p>
    )
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        <div className="flex rounded-lg border border-quasar-gray-light p-0.5 w-fit">
          {([
            { key: 'kanban', label: '⬛ Kanban' },
            { key: 'lista', label: '☰ Listă' },
          ] as const).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                mode === m.key
                  ? 'bg-quasar-yellow font-medium text-quasar-black'
                  : 'text-quasar-gray hover:text-quasar-black'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <LeadFilters
          value={filters}
          campanii={campaniiQuery.data ?? []}
          onChange={setFilters}
          variant={mode === 'lista' ? 'lista' : 'kanban'}
        />
      </div>

      <NurtureMatchBanner search={filters.search} />

      {/* Pe lista nefiltrată — „de lucrat azi" nu depinde de filtrele kanban. */}
      <TodayPanel
        leads={leads}
        onLeadClick={setEditingLead}
        onLogContact={setLogContactLead}
      />

      {mode === 'lista' ? (
        <LeadListView
          leads={filtered}
          totalLeads={baseLeads.length}
          campaniiById={campaniiById}
          prezentaByLead={prezenteQuery.data}
          contactatiAzi={contactatiAzi}
          filters={filters}
          onFiltersChange={setFilters}
          onLeadClick={setEditingLead}
          onLogContact={setLogContactLead}
        />
      ) : (
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={scrollRef}
          className="flex items-start gap-3 overflow-x-auto pb-4"
        >
          {PIPELINE_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.status}
              column={column}
              leads={filtered.filter((l) => l.status === column.status)}
              campaniiById={campaniiById}
              onLeadClick={(lead) => setEditingLead(lead)}
              onAddLead={(status) => setAddingToStatus(status)}
              onLogContact={(lead) => setLogContactLead(lead)}
              onEnroll={handleEnroll}
              enrolledClientIds={enrolledClientIds}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && (
            <div className="rotate-2 opacity-90 shadow-2xl">
              <LeadCard
                lead={activeLead}
                campaniiById={campaniiById}
                onClick={() => {}}
                isDragging
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      )}

      {mode === 'kanban' && <BottomScrollbar targetRef={scrollRef} />}

      {editingLead && (
        <LeadModal
          open
          lead={editingLead}
          onClose={() => setEditingLead(null)}
        />
      )}
      {addingToStatus && (
        <LeadModal
          open
          defaultStatus={addingToStatus}
          startScheduling={addingToStatus === 'programat'}
          onClose={() => setAddingToStatus(null)}
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
      {pierdutLead && (
        <PierdutModal
          open
          lead={pierdutLead}
          onClose={() => setPierdutLead(null)}
        />
      )}
      {contactareLead && (
        <ContactareModal
          open
          lead={contactareLead}
          onClose={() => setContactareLead(null)}
        />
      )}
      {waitingLead && (
        <WaitingListModal
          open
          lead={waitingLead}
          onClose={() => setWaitingLead(null)}
        />
      )}
      {convertLead && (
        <ConversieModal
          open
          lead={convertLead}
          onClose={() => setConvertLead(null)}
          onConverted={(result) => {
            setConvertLead(null)
            setEnrollData(result)
          }}
        />
      )}
      {enrollData && (
        <EnrollmentForm
          open
          defaultClientId={enrollData.clientId}
          defaultCursId={enrollData.cursId ?? undefined}
          onEnrolled={() => {
            // Înrolarea a reușit → abia acum lead-ul devine convertit.
            void markLeadConvertit(enrollData.leadId).finally(() => {
              void queryClient.invalidateQueries({ queryKey: ['leads'] })
            })
          }}
          onClose={() => setEnrollData(null)}
        />
      )}
      {logContactLead && (
        <LogContactModal
          open
          lead={logContactLead}
          onClose={() => setLogContactLead(null)}
        />
      )}

      {dragError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-xl">
          Eroare la mutare: {dragError}
        </div>
      )}
    </>
  )
}

// Bară de scroll orizontal lipită de marginea de jos a ecranului, sincronizată
// cu board-ul. Necesară pe desktop cu mouse fără rotiță orizontală: bara nativă
// stă la baza celei mai înalte coloane (sub ecran), aici e mereu la îndemână.
// NU atinge scroll-ul vertical — derulează doar orizontal board-ul.
function BottomScrollbar({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const [m, setM] = useState({ scrollWidth: 0, left: 0, width: 0 })

  useEffect(() => {
    const target = targetRef.current
    const bar = barRef.current
    if (!target || !bar) return

    const update = () => {
      const rect = target.getBoundingClientRect()
      setM({
        scrollWidth: target.scrollWidth,
        left: rect.left,
        width: rect.width,
      })
    }
    update()

    let lock = false
    const onTarget = () => {
      if (lock) return
      lock = true
      bar.scrollLeft = target.scrollLeft
      requestAnimationFrame(() => (lock = false))
    }
    const onBar = () => {
      if (lock) return
      lock = true
      target.scrollLeft = bar.scrollLeft
      requestAnimationFrame(() => (lock = false))
    }
    target.addEventListener('scroll', onTarget, { passive: true })
    bar.addEventListener('scroll', onBar, { passive: true })

    const ro = new ResizeObserver(update)
    ro.observe(target)
    // Coloanele cresc/scad pe filtrare → urmărim și schimbările de conținut.
    const mo = new MutationObserver(update)
    mo.observe(target, { childList: true, subtree: true })
    window.addEventListener('resize', update)

    return () => {
      target.removeEventListener('scroll', onTarget)
      bar.removeEventListener('scroll', onBar)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [targetRef])

  // Randăm bara mereu (altfel barRef ar fi null și efectul n-ar putea măsura),
  // dar o ascundem când nu e nimic de derulat orizontal.
  const overflowing = m.scrollWidth > m.width + 1

  return (
    <div
      ref={barRef}
      className="kanban-scroll fixed bottom-0 z-40 overflow-x-scroll overflow-y-hidden"
      style={{
        left: m.left,
        width: m.width || '100%',
        height: 16,
        visibility: overflowing ? 'visible' : 'hidden',
      }}
    >
      <div style={{ width: m.scrollWidth, height: 1 }} />
    </div>
  )
}
