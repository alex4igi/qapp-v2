import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, PageHeader, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useIsMobile } from '@/hooks/useIsMobile'
import { hasTeacherLens } from '@/lib/rolesMatrix'
import { saliOptions } from '@/lib/lookups'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { InchiriereTab } from '@/features/plati/modals/PlataNouaModal/InchiriereTab'
import { RoomLocationFilter } from '../components/RoomLocationFilter'
import { WeekNav } from '../components/WeekNav'
import { WeekGrid } from '../components/WeekGrid'
import { DayStrip } from '../components/DayStrip'
import { TodayPanel } from '../components/TodayPanel'
import { NeachitatePanel } from '../components/NeachitatePanel'
import { RezervarileMelePanel } from '../components/RezervarileMelePanel'
import { EditInchiriereModal } from '../components/EditInchiriereModal'
import { useWeekOccupancy } from '../hooks/useWeekOccupancy'
import { mondayOf, todayIso, weekDays } from '../week'
import { OCCUP_LEGEND, OCCUP_STYLE } from '../constants'

type BookingPrefill = { locatie: string; sala: string; data: string; oraStart: string }

export function CalendarPage() {
  const { role, teacherId } = useAuth()
  const teacherMode = role === 'teacher'
  const isMobile = useIsMobile()
  // Oricine are profil de instructor își vede rezervările proprii; recepția și
  // managerii păstrează în plus panourile operaționale.
  const showRezervarileMele = hasTeacherLens(role, teacherId)
  const {
    locatieId: workLocatie,
    locatieNume: workLocatieNume,
    locked: locatieLocked,
  } = useWorkingLocatie()
  const { date: workDate } = useWorkingDate()

  const [locatie, setLocatie] = useState(workLocatie ?? '')
  const [sala, setSala] = useState('')
  const [mondayIso, setMondayIso] = useState(() => mondayOf(workDate || todayIso()))
  const [booking, setBooking] = useState<BookingPrefill | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [pickedDay, setPickedDay] = useState<string | null>(null)

  // „Rezervi doar la locația ta": recepția legată de o locație poate VEDEA orice
  // locație, dar rezervă doar la a ei (dublat de politica RLS de insert).
  // Instructorul face excepție — își rezervă sala la orice locație, indiferent
  // unde predă (regulă schimbată 2026-07-28, vezi migrația de aceeași dată).
  const canBookHere =
    teacherMode || !locatieLocked || !workLocatie || locatie === workLocatie

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

  // Ziua aleasă pe telefon; la schimbarea săptămânii cade pe azi (dacă e în ea) sau pe luni.
  const weekIsos = weekDays(mondayIso)
  const dayIso =
    pickedDay && weekIsos.includes(pickedDay)
      ? pickedDay
      : weekIsos.includes(today)
        ? today
        : mondayIso

  return (
    <div>
      <PageHeader
        title="Închirieri săli"
        subtitle={
          teacherMode
            ? 'Calendar ocupare — click pe un slot liber pentru a-ți rezerva sala.'
            : 'Calendar ocupare (cursuri + evenimente + închirieri) — click pe un slot liber pentru a rezerva.'
        }
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
        {OCCUP_LEGEND.filter((l) => teacherMode || l.kind !== 'inchiriere-ocupata').map((l) => (
          <span key={l.kind} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border ${OCCUP_STYLE[l.kind]}`} />
            {l.label}
          </span>
        ))}
      </div>

      {!canBookHere && (
        <p className="mb-2 rounded-md border border-warn/50 bg-warn/10 p-2 text-sm text-ink">
          Vizualizezi altă locație — rezervările se fac doar la locația ta
          {workLocatieNume ? ` (${workLocatieNume})` : ''}.
        </p>
      )}

      {isMobile && showRezervarileMele && (
        <div className="mb-3">
          <RezervarileMelePanel onRental={(id) => setEditId(id)} />
        </div>
      )}

      {isMobile && locatie && sala && (
        <DayStrip
          mondayIso={mondayIso}
          dayIso={dayIso}
          todayIso={today}
          onChange={setPickedDay}
        />
      )}

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
              days={isMobile ? [dayIso] : days}
              compact={isMobile}
              byDate={byDate}
              todayIso={today}
              onFree={(dateIso, oraStart) => {
                if (!canBookHere) return
                setBooking({ locatie, sala, data: dateIso, oraStart })
              }}
              onRental={(id) => setEditId(id)}
            />
          )}
        </div>

        <div className="space-y-4">
          {showRezervarileMele && !isMobile && (
            <RezervarileMelePanel onRental={(id) => setEditId(id)} />
          )}
          {!teacherMode && (
            <>
              <TodayPanel locatieId={locatie || null} onRental={(id) => setEditId(id)} />
              <NeachitatePanel locatieId={locatie || null} onRental={(id) => setEditId(id)} />
            </>
          )}
        </div>
      </div>

      {booking &&
        (teacherMode || isMobile ? (
          // Teacherul nu primește modalul complet de Plată nouă (taburi de
          // încasare) — doar formularul de rezervare, în modul lui restrâns.
          // Pe telefon nici recepția: Plată nouă cu 6 taburi e doar pe desktop.
          <Modal open title="Rezervare sală" onClose={() => setBooking(null)} size="xl">
            <InchiriereTab onClose={() => setBooking(null)} defaultInchiriere={booking} />
          </Modal>
        ) : (
          <PlataNouaModal
            open
            onClose={() => setBooking(null)}
            defaultTip="Inchiriere"
            defaultInchiriere={booking}
          />
        ))}

      {editId && (
        <EditInchiriereModal inchiriereId={editId} onClose={() => setEditId(null)} />
      )}
    </div>
  )
}
