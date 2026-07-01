import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { saliOptions } from '@/lib/lookups'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { RoomLocationFilter } from '../components/RoomLocationFilter'
import { WeekNav } from '../components/WeekNav'
import { WeekGrid } from '../components/WeekGrid'
import { TodayPanel } from '../components/TodayPanel'
import { EditInchiriereModal } from '../components/EditInchiriereModal'
import { useWeekOccupancy } from '../hooks/useWeekOccupancy'
import { mondayOf, todayIso } from '../week'
import { OCCUP_LEGEND, OCCUP_STYLE } from '../constants'

type BookingPrefill = { locatie: string; sala: string; data: string; oraStart: string }

export function CalendarPage() {
  const { locatieId: workLocatie } = useWorkingLocatie()
  const { date: workDate } = useWorkingDate()

  const [locatie, setLocatie] = useState(workLocatie ?? '')
  const [sala, setSala] = useState('')
  const [mondayIso, setMondayIso] = useState(() => mondayOf(workDate || todayIso()))
  const [booking, setBooking] = useState<BookingPrefill | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  // Auto-selectează prima sală când se schimbă locația.
  const saliQ = useQuery({
    queryKey: ['lookup', 'sali', locatie],
    queryFn: () => saliOptions(locatie),
    enabled: Boolean(locatie),
  })
  useEffect(() => {
    if (!sala && saliQ.data?.length) setSala(saliQ.data[0].value)
  }, [saliQ.data, sala])

  const { days, byDate, isLoading } = useWeekOccupancy({
    locatieId: locatie || null,
    salaId: sala,
    mondayIso,
  })
  const today = useMemo(() => todayIso(), [])

  return (
    <div>
      <PageHeader
        title="Închirieri săli"
        subtitle="Calendar ocupare (cursuri + închirieri) — click pe un slot liber pentru a rezerva."
      />

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <RoomLocationFilter
          locatie={locatie}
          sala={sala}
          onLocatie={setLocatie}
          onSala={setSala}
        />
        <WeekNav
          mondayIso={mondayIso}
          onChange={setMondayIso}
          onToday={() => setMondayIso(mondayOf(todayIso()))}
        />
      </div>

      {/* Legendă */}
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        {OCCUP_LEGEND.map((l) => (
          <span key={l.kind} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border ${OCCUP_STYLE[l.kind]}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="rounded-lg border border-line bg-card p-2">
          {!locatie || !sala ? (
            <p className="p-6 text-center text-sm text-muted">
              Alege locația și sala pentru a vedea calendarul.
            </p>
          ) : isLoading ? (
            <Spinner />
          ) : (
            <WeekGrid
              days={days}
              byDate={byDate}
              todayIso={today}
              onFree={(dateIso, oraStart) =>
                setBooking({ locatie, sala, data: dateIso, oraStart })
              }
              onRental={(id) => setEditId(id)}
            />
          )}
        </div>

        <TodayPanel locatieId={locatie || null} onRental={(id) => setEditId(id)} />
      </div>

      {booking && (
        <PlataNouaModal
          open
          onClose={() => setBooking(null)}
          defaultTip="Inchiriere"
          defaultInchiriere={booking}
        />
      )}

      {editId && (
        <EditInchiriereModal inchiriereId={editId} onClose={() => setEditId(null)} />
      )}
    </div>
  )
}
