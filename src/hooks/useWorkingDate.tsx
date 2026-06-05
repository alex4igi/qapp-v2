import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { todayIso } from '@/features/dashboard/api'

type Ctx = {
  date: string // YYYY-MM-DD
  setDate: (next: string) => void
  resetToToday: () => void
  isToday: boolean
}

const WorkingDateContext = createContext<Ctx | undefined>(undefined)

export function WorkingDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => todayIso())

  const value = useMemo<Ctx>(() => {
    const today = todayIso()
    return {
      date,
      setDate,
      resetToToday: () => setDate(todayIso()),
      isToday: date === today,
    }
  }, [date])

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
