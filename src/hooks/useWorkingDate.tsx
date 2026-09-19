import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { todayIso } from '@/features/dashboard/api'
import { useTodayOnly } from './useTodayOnly'

type Ctx = {
  date: string // YYYY-MM-DD
  setDate: (next: string) => void
  resetToToday: () => void
  isToday: boolean
}

const WorkingDateContext = createContext<Ctx | undefined>(undefined)

export function WorkingDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => todayIso())
  const { active: todayOnly } = useTodayOnly()

  const value = useMemo<Ctx>(() => {
    const today = todayIso()
    // Modul „doar azi" blochează ziua de lucru AICI, la sursă: orice pagină care
    // citește `date` primește ziua curentă, indiferent ce selector de dată are.
    const effective = todayOnly ? today : date
    return {
      date: effective,
      setDate: todayOnly ? () => {} : setDate,
      resetToToday: () => setDate(todayIso()),
      isToday: effective === today,
    }
  }, [date, todayOnly])

  return (
    <WorkingDateContext.Provider value={value}>
      {children}
    </WorkingDateContext.Provider>
  )
}

export function useWorkingDate(): Ctx {
  const ctx = useContext(WorkingDateContext)
  if (!ctx)
    throw new Error('useWorkingDate trebuie folosit în <WorkingDateProvider>')
  return ctx
}
