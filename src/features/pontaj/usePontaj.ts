import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { checkIn, checkOut, getStareCurenta } from './api'

/** Cât durează tura curentă, actualizat din minut în minut. */
function useMinuteScurse(startAt: string | null | undefined): number | null {
  const [acum, setAcum] = useState(() => Date.now())

  useEffect(() => {
    if (!startAt) return
    const t = setInterval(() => setAcum(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [startAt])

  if (!startAt) return null
  return Math.max(0, Math.floor((acum - new Date(startAt).getTime()) / 60_000))
}

export function usePontaj() {
  const { session } = useAuth()
  const qc = useQueryClient()

  const stareQ = useQuery({
    queryKey: ['pontaj-stare'],
    queryFn: getStareCurenta,
    enabled: Boolean(session),
    staleTime: 60_000,
  })

  const invalideaza = () => {
    void qc.invalidateQueries({ queryKey: ['pontaj-stare'] })
    void qc.invalidateQueries({ queryKey: ['pontaj'] })
  }

  const intraM = useMutation({
    mutationFn: () => checkIn(),
    onSuccess: invalideaza,
  })
  const iesM = useMutation({
    mutationFn: () => checkOut(),
    onSuccess: invalideaza,
  })

  const tura = stareQ.data ?? null

  return {
    tura,
    inTura: Boolean(tura),
    minuteScurse: useMinuteScurse(tura?.start_at),
    loading: stareQ.isLoading,
    inLucru: intraM.isPending || iesM.isPending,
    eroare: (intraM.error ?? iesM.error) as Error | null,
    intraInTura: () => intraM.mutateAsync(),
    iesDinTura: () => iesM.mutateAsync(),
  }
}
