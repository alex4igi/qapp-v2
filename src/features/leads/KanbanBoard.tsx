import { useMemo, useState } from 'react'
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
import { matchesWords } from '@/lib/search'
import type { Lead, StatusLead } from '@/types/db'
import { PIPELINE_COLUMNS } from './constants'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'
import { LeadModal } from './LeadModal'
import { ScheduleModal } from './ScheduleModal'
import { PierdutModal } from './PierdutModal'
import { ContactareModal } from './ContactareModal'
import { WaitingListModal } from './WaitingListModal'
import { ConversieModal, type ConversieResult } from './ConversieModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { LeadFilters, type LeadFiltersValue } from './LeadFilters'
import { listLeads, pruneExpiredLeads, updateLeadStatus } from './api'

const EMPTY_FILTERS: LeadFiltersValue = {
  search: '',
  sursa: '',
  grupa: '',
  locatie: '',
}

export function KanbanBoard() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<LeadFiltersValue>(EMPTY_FILTERS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [addingToStatus, setAddingToStatus] = useState<string | null>(null)
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null)
  const [pierdutLead, setPierdutLead] = useState<Lead | null>(null)
  const [contactareLead, setContactareLead] = useState<Lead | null>(null)
  const [waitingLead, setWaitingLead] = useState<Lead | null>(null)
  const [convertLead, setConvertLead] = useState<Lead | null>(null)
  const [enrollData, setEnrollData] = useState<ConversieResult | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)

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

  const campaniiById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaniiQuery.data ?? []) map.set(c.value, c.label)
    return map
  }, [campaniiQuery.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const leads = leadsQuery.data ?? []

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.search) {
        const hay = [lead.prenume, lead.nume, lead.telefon]
          .filter(Boolean)
          .join(' ')
        if (!matchesWords(hay, filters.search)) return false
      }
      if (filters.sursa && lead.sursa !== filters.sursa) return false
      if (filters.grupa && lead.grupa_varsta !== filters.grupa) return false
      if (filters.locatie && lead.locatia !== filters.locatie) return false
      return true
    })
  }, [leads, filters])

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
      setDragError(e instanceof Error ? e.message : 'Eroare la mutare')
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

    if (newStatus === dragged.status) return

    // Coloane terminale — lead-urile pierdute/convertite nu se mai mută.
    if (dragged.status === 'pierdut' || dragged.status === 'convertit') {
      setDragError(
        'Lead-urile pierdute sau convertite nu mai pot fi mutate.',
      )
      setTimeout(() => setDragError(null), 5000)
      return
    }

    if (newStatus === 'programat') {
      setSchedulingLead(dragged)
      return
    }
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
        {leadsQuery.error instanceof Error ? leadsQuery.error.message : ''}
      </p>
    )
  }

  return (
    <>
      <div className="mb-4">
        <LeadFilters
          value={filters}
          campanii={campaniiQuery.data ?? []}
          onChange={setFilters}
        />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {PIPELINE_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.status}
              column={column}
              leads={filtered.filter((l) => l.status === column.status)}
              campaniiById={campaniiById}
              onLeadClick={(lead) => setEditingLead(lead)}
              onAddLead={(status) => setAddingToStatus(status)}
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
          onClose={() => setAddingToStatus(null)}
        />
      )}
      {schedulingLead && (
        <ScheduleModal
          open
          lead={schedulingLead}
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
          onClose={() => setEnrollData(null)}
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
