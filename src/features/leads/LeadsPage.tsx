import { useState } from 'react'
import { PageHeader, Button } from '@/components/ui'
import { LeadModal } from './LeadModal'
import { KanbanBoard } from './KanbanBoard'
import { LeadReports } from './LeadReports'
import { NurtureView } from './NurtureView'

const VIEWS = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'rapoarte', label: 'Rapoarte' },
  { key: 'nurture', label: 'Nurture' },
] as const

type View = (typeof VIEWS)[number]['key']

export function LeadsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<View>('pipeline')

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Pipeline conversie lead-uri"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-quasar-gray-light p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`rounded-md px-3 py-1 text-sm transition-colors ${
                    view === v.key
                      ? 'bg-quasar-yellow font-medium text-quasar-black'
                      : 'text-quasar-gray hover:text-quasar-black'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'pipeline' && (
              <Button onClick={() => setAddOpen(true)}>+ Lead nou</Button>
            )}
          </div>
        }
      />
      {view === 'pipeline' && <KanbanBoard />}
      {view === 'rapoarte' && <LeadReports />}
      {view === 'nurture' && <NurtureView />}
      {addOpen && <LeadModal open onClose={() => setAddOpen(false)} />}
    </div>
  )
}
