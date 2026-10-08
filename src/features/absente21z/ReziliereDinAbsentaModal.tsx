import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { humanizeError } from '@/lib/errorMessage'
import { endOfMonth, rezilizaInrolari, recalcUltimaLunaReziliere } from '@/features/plati/api'
import { reintegrateClientAsLead } from '@/features/leads/api'
import { ConfirmReziliereModal } from '@/features/clienti/pages/ClientProfilePage/ConfirmReziliereModal'
import type { CerereReziliere } from './ContactAbsentaModal'

type Props = {
  cerere: CerereReziliere | null
  onClose: () => void
  /** După reziliere: pasul cu cererea de reziliere la semnat. */
  onReziliat: (c: CerereReziliere) => void
}

// Aceeași reziliere ca din fișa clientului (lunile de după cea curentă), deschisă direct
// după „Renunță" / „Amână" pe un caz de absență, cu motivul deja completat.
export function ReziliereDinAbsentaModal({ cerere, onClose, onReziliat }: Props) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [motiv, setMotiv] = useState('')
  const [reintegrare, setReintegrare] = useState(false)
  const [recalc, setRecalc] = useState(false)

  const clientId = cerere?.caz.client_id ?? ''
  const cursId = cerere?.caz.curs_id ?? ''

  useEffect(() => {
    if (!cerere) return
    setMotiv(cerere.motiv)
    setReintegrare(cerere.reintegrare)
    setRecalc(false)
  }, [cerere])

  const luni = useQuery({
    queryKey: ['absente-21z', 'luni-viitoare', clientId, cursId],
    enabled: Boolean(cerere),
    queryFn: async () => {
      const azi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
      const { count, error } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('client', clientId)
        .eq('cursul', cursId)
        .eq('reziliat', false)
        .gt('data_incepere', endOfMonth(`${azi.slice(0, 7)}-01`))
      if (error) throw error
      return count ?? 0
    },
  })

  const rezilia = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: async () => {
      await rezilizaInrolari({ clientId, cursId, motiv })
      if (recalc) await recalcUltimaLunaReziliere({ clientId, cursId })
      if (reintegrare) await reintegrateClientAsLead(clientId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      void queryClient.invalidateQueries({ queryKey: ['absente-21z'] })
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      const c = cerere!
      onClose()
      onReziliat(c)
    },
  })

  // Fără luni viitoare (n-a mai plătit / ultima lună e cea curentă) nu e nimic de reziliat.
  const nimicDeReziliat = luni.isSuccess && luni.data === 0
  useEffect(() => {
    if (cerere && nimicDeReziliat) onClose()
  }, [cerere, nimicDeReziliat, onClose])

  if (!cerere || !luni.isSuccess || nimicDeReziliat) return null

  return (
    <ConfirmReziliereModal
      open
      cursId={cursId}
      clientId={clientId}
      reziliereCount={luni.data ?? 0}
      motiv={motiv}
      reintegrateAsLead={reintegrare}
      canRecalc={isManagerOrHigher(role)}
      recalcChecked={recalc}
      isPending={rezilia.isPending}
      error={rezilia.error ? humanizeError(rezilia.error) : null}
      onMotivChange={setMotiv}
      onReintegrateChange={setReintegrare}
      onRecalcChange={setRecalc}
      onConfirm={() => rezilia.mutate()}
      onClose={onClose}
    />
  )
}
