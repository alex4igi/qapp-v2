import { Link } from 'react-router-dom'
import { Button, Select, Badge, type BadgeTone } from '@/components/ui'
import { ChecklistCard } from '@/components/checklist'
import type { Rezultat, StareItem } from '@/lib/checklist'
import { DetailRow } from './helpers'

type Props = {
  initials: string
  nume: string
  prenume: string | null
  status?: string | null
  varsta: number | null
  familia: string
  familiaId: string | null
  sezoaneOptions: { value: string; label: string }[]
  sezonValue: string
  onSezonChange: (id: string) => void
  cursuri: { id: string; nume: string }[]
  // Înrolarea e responsabilitatea front_desk/manager — pentru teacher butonul
  // nu se afișează (RLS pe enrollments oricum îl blochează).
  canEnroll: boolean
  onEnroll: () => void
  /** Absent ⇒ rolul nu vede checklistul fișei (teacher). */
  checklist?: Rezultat
  /** Absent ⇒ card read-only (rolul nu poate edita clientul). */
  onFixChecklist?: (item: StareItem) => void
}

function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'Activ':
      return 'success'
    case 'Programat':
    case 'Lead':
      return 'warn'
    default:
      return 'neutral'
  }
}

export function ClientSidebar({
  initials,
  nume,
  prenume,
  status,
  varsta,
  familia,
  familiaId,
  sezoaneOptions,
  sezonValue,
  onSezonChange,
  cursuri,
  canEnroll,
  onEnroll,
  checklist,
  onFixChecklist,
}: Props) {
  return (
    <div className="space-y-4">
    <aside className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="mb-3 flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-quasar-yellow font-display text-3xl font-bold text-ink">
          {initials}
        </div>
      </div>
      <h2 className="text-center font-display text-lg font-bold tracking-tight text-ink">
        {nume} {prenume ?? ''}
      </h2>
      {status && (
        <div className="mt-2 flex justify-center">
          <Badge tone={statusTone(status)}>{status}</Badge>
        </div>
      )}
      {familiaId && (
        <div className="mt-2 text-center">
          <Link
            to={`/familii/${familiaId}`}
            className="text-sm font-medium text-ink underline decoration-quasar-yellow decoration-2 underline-offset-2 hover:text-muted-2"
          >
            {familia || 'Vezi familia'} →
          </Link>
        </div>
      )}
      <dl className="mt-4 space-y-3">
        <DetailRow label="Vârsta" value={varsta != null ? String(varsta) : ''} />
        <DetailRow
          label="Familia"
          value={familia}
          to={familiaId ? `/familii/${familiaId}` : undefined}
        />
        <div>
          <dt className="mb-1 text-xs font-medium text-muted">În sezonul</dt>
          <Select
            options={sezoaneOptions}
            value={sezonValue}
            onChange={(e) => onSezonChange(e.target.value)}
            placeholder={sezoaneOptions.length ? undefined : '— nu există sezoane —'}
          />
        </div>
        <div>
          <dt className="mb-1 text-xs font-medium text-muted">Cursuri</dt>
          {cursuri.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {cursuri.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/cursuri/${c.id}`}
                    className="text-ink hover:text-muted-2 hover:underline"
                  >
                    {c.nume}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dl>
      {canEnroll && (
        <Button variant="secondary" className="mt-4 w-full" onClick={onEnroll}>
          + Înrolează la curs
        </Button>
      )}
    </aside>

    {checklist && (
      <ChecklistCard rezultat={checklist} onFix={onFixChecklist} />
    )}
    </div>
  )
}
