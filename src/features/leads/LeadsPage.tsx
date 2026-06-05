import { useState } from 'react'
import { PageHeader, Button } from '@/components/ui'
import { LeadModal } from './LeadModal'
import { KanbanBoard } from './KanbanBoard'
import { LeadReports } from './LeadReports'

export function LeadsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<'pipeline' | 'rapoarte'>('pipeline')

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Pipeline conversie lead-uri"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-quasar-gray-light p-0.5">
              {(['pipeline', 'rapoarte'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-sm transition-colors ${
                    view === v
                      ? 'bg-quasar-yellow font-medium text-quasar-black'
                      : 'text-quasar-gray hover:text-quasar-black'
                  }`}
                >
                  {v === 'pipeline' ? 'Pipeline' : 'Rapoarte'}
                </button>
              ))}
            </div>
            {view === 'pipeline' && (
              <Button onClick={() => setAddOpen(true)}>+ Lead nou</Button>
            )}
          </div>
        }
      />
      {view === 'pipeline' ? <KanbanBoard /> : <LeadReports />}
      {addOpen && <LeadModal open onClose={() => setAddOpen(false)} />}
    </div>
  )
}
