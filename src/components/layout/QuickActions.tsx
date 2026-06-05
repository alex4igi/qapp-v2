import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ClientForm } from '@/features/clienti/ClientForm'
import { LeadModal } from '@/features/leads/LeadModal'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'

const BTN =
  'flex items-center gap-2 rounded-md border border-quasar-gray-light bg-quasar-yellow/60 px-3 py-2 text-sm font-medium text-quasar-black transition-colors hover:bg-quasar-yellow'

const ICON_BG = 'flex h-7 w-7 items-center justify-center rounded-full bg-white text-base'

export function QuickActions() {
  const { role } = useAuth()
  const [plataOpen, setPlataOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [leadOpen, setLeadOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  // Pentru rolul teacher nu afișăm quick actions (vede doar Evaluări).
  if (role === 'teacher') return null

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-quasar-gray-light p-3">
        <button type="button" className={BTN} onClick={() => setPlataOpen(true)}>
          <span className={ICON_BG}>$</span>
          Plată nouă
        </button>
        <button type="button" className={BTN} onClick={() => setEnrollOpen(true)}>
          <span className={ICON_BG}>🎓</span>
          Înrolare nouă
        </button>
        <button type="button" className={BTN} onClick={() => setLeadOpen(true)}>
          <span className={ICON_BG}>👤</span>
          Lead nou
        </button>
        <button type="button" className={BTN} onClick={() => setClientOpen(true)}>
          <span className={ICON_BG}>＋</span>
          Client nou
        </button>
      </div>

      {plataOpen && (
        <PlataNouaModal open onClose={() => setPlataOpen(false)} />
      )}
      {enrollOpen && (
        <EnrollmentForm open onClose={() => setEnrollOpen(false)} />
      )}
      {leadOpen && (
        <LeadModal open onClose={() => setLeadOpen(false)} />
      )}
      {clientOpen && (
        <ClientForm open onClose={() => setClientOpen(false)} />
      )}
    </>
  )
}
