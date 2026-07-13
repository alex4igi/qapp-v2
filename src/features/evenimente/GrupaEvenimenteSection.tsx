import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Spinner, Badge } from '@/components/ui'
import { formatDate } from '@/lib/format'
import type { Eveniment } from '@/types/db'
import { listEvenimenteGrupa } from './api'
import { EvenimentGrupaForm } from './EvenimentGrupaForm'

// Evenimentele grupei (tab pe pagina grupei): teacherul creează/editează
// evenimente exclusive grupei lui — apar în calendarul portalului doar
// pentru cursanții grupei. RLS-ul scopează scrierea pe grupele teacherului.
export function GrupaEvenimenteSection({ cursId }: { cursId: string }) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Eveniment | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['evenimente', 'grupa', cursId],
    queryFn: () => listEvenimenteGrupa(cursId),
  })

  const today = new Date().toISOString().slice(0, 10)
  const { viitoare, trecute } = useMemo(() => {
    const rows = data ?? []
    return {
      viitoare: rows.filter((e) => (e.data ?? '') >= today),
      trecute: rows.filter((e) => (e.data ?? '') < today).reverse(),
    }
  }, [data, today])

  const openEdit = (e: Eveniment) => {
    setEditing(e)
    setFormOpen(true)
  }
  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const close = () => {
    setFormOpen(false)
    setEditing(null)
  }

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Eroare la încărcare.</p>

  const Row = ({ e }: { e: Eveniment }) => (
    <button
      type="button"
      onClick={() => openEdit(e)}
      className="flex w-full items-center gap-3 rounded-[11px] border border-line bg-card px-4 py-3 text-left transition-colors hover:border-quasar-yellow"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">
          {e.nume_eveniment}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {[
            e.data ? formatDate(e.data) : null,
            e.ora,
            e.locatia,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </div>
      </div>
      <Badge tone="neutral">{e.tip}</Badge>
      {e.status === 'Anulat' && <Badge tone="danger">Anulat</Badge>}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Evenimente exclusive grupei — vizibile în calendarul portalului doar
          pentru cursanții grupei.
        </p>
        <Button onClick={openNew}>+ Eveniment grupă</Button>
      </div>

      {viitoare.length === 0 && trecute.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
          Niciun eveniment pentru această grupă.
        </p>
      ) : (
        <>
          {viitoare.length > 0 && (
            <div className="space-y-2">
              {viitoare.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
          )}
          {trecute.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Trecute
              </div>
              {trecute.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
          )}
        </>
      )}

      {formOpen && (
        <EvenimentGrupaForm
          key={editing?.id ?? 'nou'}
          open={formOpen}
          cursId={cursId}
          eveniment={editing}
          onClose={close}
        />
      )}
    </div>
  )
}
