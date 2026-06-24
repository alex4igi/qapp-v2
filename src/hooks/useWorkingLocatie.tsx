import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { locatiiOptions } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { canChangeLocatie } from '@/lib/rolesMatrix'
import type { SelectOption } from '@/components/ui'

const STORAGE_KEY = 'qapp.working_locatie'
// Sentinel folosit în localStorage când userul a ales explicit "Toate".
// (E nevoie de o valoare distinctă de null/empty ca să distingem "Toate" de "nu am ales încă".)
const ALL_SENTINEL = '__ALL__'

type Ctx = {
  /** UUID locație, sau null dacă userul a ales „Toate locațiile". */
  locatieId: string | null
  setLocatieId: (next: string | null) => void
  options: SelectOption[]
  locatieNume: string | null
  loading: boolean
  /** True dacă locația vine din app_metadata și user-ul nu o poate schimba. */
  locked: boolean
  /** True dacă userul are dreptul să basculeze între locații + „Toate". */
  canChange: boolean
}

const WorkingLocatieContext = createContext<Ctx | undefined>(undefined)

export function WorkingLocatieProvider({ children }: { children: ReactNode }) {
  const { role, locatieId: assignedLocatieId } = useAuth()
  const baseCanChange = canChangeLocatie(role)
  // Front-desk / teacher: locked DOAR dacă au locație asignată. Dacă lucrează/predă
  // la mai multe locații, contul are locatie_id=null → poate bascula liber din header.
  const freeLocation =
    (role === 'teacher' || role === 'front_desk') && !assignedLocatieId
  const canChange = baseCanChange || freeLocation
  const locked = !canChange

  const [storedPref, setStoredPref] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null
    } catch {
      return null
    }
  })

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const setLocatieId = useCallback(
    (next: string | null) => {
      if (locked) return
      // null = userul a ales „Toate locațiile" → persistăm sentinel-ul
      const stored = next ?? ALL_SENTINEL
      setStoredPref(stored)
      try {
        localStorage.setItem(STORAGE_KEY, stored)
      } catch {
        /* localStorage indisponibil — în memorie e ok */
      }
    },
    [locked],
  )

  const value = useMemo<Ctx>(() => {
    const options = locatiiQ.data ?? []
    let effective: string | null
    if (locked) {
      effective = assignedLocatieId
    } else if (storedPref === ALL_SENTINEL) {
      effective = null
    } else if (storedPref) {
      effective = storedPref
    } else {
      // Default la primul mount: prima locație disponibilă (nu „Toate")
      effective = options[0]?.value ?? null
    }
    const found =
      effective ? options.find((o) => o.value === effective)?.label ?? null : null
    return {
      locatieId: effective,
      setLocatieId,
      options,
      locatieNume: found,
      loading: locatiiQ.isLoading,
      locked,
      canChange,
    }
  }, [
    storedPref,
    assignedLocatieId,
    locked,
    canChange,
    locatiiQ.data,
    locatiiQ.isLoading,
    setLocatieId,
  ])

  return (
    <WorkingLocatieContext.Provider value={value}>
      {children}
    </WorkingLocatieContext.Provider>
  )
}

export function useWorkingLocatie(): Ctx {
  const ctx = useContext(WorkingLocatieContext)
  if (!ctx)
    throw new Error(
      'useWorkingLocatie trebuie folosit în <WorkingLocatieProvider>',
    )
  return ctx
}
