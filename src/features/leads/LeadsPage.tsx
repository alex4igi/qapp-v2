import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { canEditLeads } from '@/lib/rolesMatrix'
import { LeadsMobileView } from './LeadsMobileView'
import { LeadModal } from './LeadModal'
import { LeadImportModal } from './LeadImportModal'
import { KanbanBoard } from './KanbanBoard'
import { LeadReports } from './LeadReports'
import { ProceduraModal } from './ProceduraModal'

// Un singur rând de navigare. „Listă" și „Kanban" sunt două randări ale
// aceluiași set, nu domenii diferite — de aceea stau lângă Rapoarte, nu sub el.
//
// „Nurture" NU e o vedere separată (a fost, și dubla Lista): e o scurtătură
// către Listă cu presetul de status pe Nurture. Rămâne totuși tab, fiindcă era
// un punct de intrare intrat în reflex — redundanța de cod și cea de navigare
// sunt lucruri diferite.
const VIEWS = [
  { key: 'lista', label: '☰ Listă' },
  { key: 'kanban', label: '⬛ Kanban' },
  { key: 'rapoarte', label: '📊 Rapoarte' },
  { key: 'nurture', label: '♻️ Nurture' },
] as const

type View = (typeof VIEWS)[number]['key']

export function LeadsPage() {
  const { role } = useAuth()
  // Agenția de ads citește pipeline-ul ca să verifice atribuirea, dar nu-l
  // atinge. RLS refuză oricum scrierea — aici doar nu arătăm butoane moarte.
  const poateEdita = canEditLeads(role)
  const isMobile = useIsMobile()
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Nurture nu e coloană în kanban, deci n-are butonul „ℹ︎" din capul coloanei.
  const [proceduraNurture, setProceduraNurture] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Vederea stă în URL ca lista de sunat să poată fi pusă la favorite.
  const vedere = searchParams.get('vedere')
  const status = searchParams.get('status')
  const view: View =
    vedere === 'rapoarte' ? 'rapoarte'
    : vedere === 'kanban' ? 'kanban'
    : status === 'nurture' ? 'nurture'
    : 'lista'

  function setView(next: View) {
    const p = new URLSearchParams(searchParams)
    if (next === 'nurture') {
      p.delete('vedere')
      p.set('status', 'nurture')
    } else {
      p.delete('status')
      if (next === 'lista') p.delete('vedere')
      else p.set('vedere', next)
    }
    setSearchParams(p, { replace: true })
  }

  if (isMobile) return <LeadsMobileView poateEdita={poateEdita} />

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
            {view === 'nurture' && (
              <Button
                variant="secondary"
                onClick={() => setProceduraNurture(true)}
              >
                ℹ︎ Procedura
              </Button>
            )}
            {view !== 'rapoarte' && poateEdita && (
              <>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  Import CSV
                </Button>
                <Button onClick={() => setAddOpen(true)}>+ Lead nou</Button>
              </>
            )}
          </div>
        }
      />
      {view === 'rapoarte' ? (
        <LeadReports />
      ) : (
        <KanbanBoard mode={view === 'kanban' ? 'kanban' : 'lista'} />
      )}
      {addOpen && <LeadModal open onClose={() => setAddOpen(false)} />}
      {importOpen && (
        <LeadImportModal open onClose={() => setImportOpen(false)} />
      )}
      <ProceduraModal
        status={proceduraNurture ? 'nurture' : null}
        onClose={() => setProceduraNurture(false)}
      />
    </div>
  )
}
