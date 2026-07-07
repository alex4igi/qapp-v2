import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Badge, Combobox } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { clientiOptions } from '@/lib/lookups'
import type { ActCuPerformeri } from './api/lineup'
import {
  addPerformer,
  removePerformer,
  seedPerformeriDinCurs,
} from './api'

type Props = {
  act: ActCuPerformeri
  spectacolId: string
  onEdit: () => void
}

export function LineupAct({ act, spectacolId, onEdit }: Props) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: act.id })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['spectacol-lineup', spectacolId] })

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
    enabled: adding,
  })

  const seed = useMutation({
    mutationFn: () => {
      if (!act.curs) throw new Error('Actul nu are o grupă/trupă sursă.')
      return seedPerformeriDinCurs(act.id, act.curs)
    },
    onSuccess: () => void invalidate(),
    onError: (e) => setErr(humanizeError(e, 'Eroare la import performeri.')),
  })

  const add = useMutation({
    mutationFn: (clientId: string) => addPerformer(act.id, clientId),
    onSuccess: () => {
      setAdding(false)
      void invalidate()
    },
    onError: (e) => setErr(humanizeError(e, 'Eroare la adăugare.')),
  })

  const del = useMutation({
    mutationFn: (performerId: string) => removePerformer(performerId),
    onSuccess: () => void invalidate(),
    onError: (e) => setErr(humanizeError(e, 'Eroare la ștergere.')),
  })

  // Ascunde din combobox performerii deja adăugați.
  const perfClientIds = new Set(act.performeri.map((p) => p.client))
  const addOptions = (clientiQ.data ?? []).filter(
    (o) => !perfClientIds.has(o.value),
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[12px] border border-line bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none select-none text-quasar-gray hover:text-ink"
          aria-label="Reordonează"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink">
          {act.ordine + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{act.titlu}</h3>
            {act.durata_min != null && (
              <Badge tone="neutral">{act.durata_min}′</Badge>
            )}
            <Badge tone="brand">{act.performeri.length} pers.</Badge>
          </div>
          <p className="mt-0.5 text-xs text-quasar-gray">
            {act.cursNume ?? 'fără grupă'}
            {act.responsabilNume ? ` · resp. ${act.responsabilNume}` : ''}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {act.performeri.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-ink"
              >
                {p.nume} {p.prenume ?? ''}
                <button
                  type="button"
                  className="text-quasar-gray hover:text-danger"
                  onClick={() => del.mutate(p.id)}
                  aria-label="Elimină performer"
                >
                  ×
                </button>
              </span>
            ))}
            {act.performeri.length === 0 && (
              <span className="text-xs text-quasar-gray">
                Niciun performer încă.
              </span>
            )}
          </div>

          {adding ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="max-w-xs flex-1">
                <Combobox
                  options={addOptions}
                  value=""
                  onChange={(v) => v && add.mutate(v)}
                  placeholder="Caută cursant…"
                />
              </div>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Renunță
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {act.curs && (
                <Button
                  variant="secondary"
                  onClick={() => seed.mutate()}
                  disabled={seed.isPending}
                >
                  {seed.isPending ? 'Se importă…' : '↧ Import din grupă'}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setAdding(true)}>
                + Performer
              </Button>
              <Button variant="ghost" onClick={onEdit}>
                Editează act
              </Button>
            </div>
          )}

          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  )
}
