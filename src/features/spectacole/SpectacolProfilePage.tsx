import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { PageHeader, Button, Spinner, Badge } from '@/components/ui'
import type { SpectacolAct } from '@/types/db'
import { getSpectacol, getLineup, reorderActe } from './api'
import type { ActCuPerformeri } from './api/lineup'
import { computeQuickChanges } from './helpers'
import { printPlaybook } from './playbook'
import { SpectacolForm } from './SpectacolForm'
import { ActForm } from './ActForm'
import { LineupAct } from './LineupAct'

export function SpectacolProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [actModal, setActModal] = useState<{ act: SpectacolAct | null } | null>(
    null,
  )

  const spectacolQ = useQuery({
    queryKey: ['spectacol', id],
    queryFn: () => getSpectacol(id!),
    enabled: Boolean(id),
  })

  const lineupQ = useQuery({
    queryKey: ['spectacol-lineup', id],
    queryFn: () => getLineup(id!),
    enabled: Boolean(id),
  })

  const acte = lineupQ.data ?? []
  const warnings = useMemo(() => computeQuickChanges(acte), [acte])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => reorderActe(orderedIds),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['spectacol-lineup', id] }),
  })

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = acte.findIndex((a) => a.id === active.id)
    const newIndex = acte.findIndex((a) => a.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(acte, oldIndex, newIndex)
    // Optimistic: rescrie cache-ul cu noua ordine imediat, apoi persistă.
    queryClient.setQueryData<ActCuPerformeri[]>(
      ['spectacol-lineup', id],
      reordered.map((a, i) => ({ ...a, ordine: i })),
    )
    reorder.mutate(reordered.map((a) => a.id))
  }

  if (spectacolQ.isLoading) return <Spinner />
  if (spectacolQ.isError || !spectacolQ.data)
    return (
      <p className="text-sm text-red-600">
        Eroare: {humanizeError(spectacolQ.error, 'Spectacol negăsit.')}
      </p>
    )

  const s = spectacolQ.data
  const subtitle = [s.data, s.ora, s.locatie].filter(Boolean).join(' · ')

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/spectacole')}
        className="mb-2 text-sm text-quasar-gray hover:text-ink"
      >
        ← Spectacole
      </button>

      <PageHeader
        title={s.nume}
        subtitle={subtitle || undefined}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => printPlaybook(s, acte, warnings)}
            >
              🖨 Desfășurător
            </Button>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Editează
            </Button>
            <Button onClick={() => setActModal({ act: null })}>+ Act nou</Button>
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="mb-4 rounded-[12px] border border-warn/40 bg-warn-bg p-3">
          <p className="mb-1 text-sm font-semibold text-warn">
            ⚡ {warnings.length} schimbări rapide
          </p>
          <ul className="space-y-0.5 text-xs text-ink">
            {warnings.map((w, i) => (
              <li key={i}>
                <strong>{w.nume}</strong> — actul {w.actA.pos} → actul {w.actB.pos}
                {w.gap === 1 && (
                  <Badge tone="warn" className="ml-1.5">
                    consecutiv
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lineupQ.isLoading ? (
        <Spinner />
      ) : acte.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-line p-8 text-center text-sm text-quasar-gray">
          Niciun act în lineup. Adaugă primul act.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={acte.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {acte.map((a) => (
                <LineupAct
                  key={a.id}
                  act={a}
                  spectacolId={id!}
                  onEdit={() => setActModal({ act: a })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editOpen && (
        <SpectacolForm
          open
          spectacol={s}
          onClose={() => {
            setEditOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['spectacol', id] })
          }}
        />
      )}

      {actModal && (
        <ActForm
          open
          spectacolId={id!}
          nextOrdine={acte.length}
          act={actModal.act}
          onClose={() => setActModal(null)}
        />
      )}
    </div>
  )
}
