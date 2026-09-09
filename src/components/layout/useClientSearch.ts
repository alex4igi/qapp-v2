import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listClienti } from '@/features/clienti/api'

const MIN_CHARS = 2
const MAX_RESULTS = 8

/**
 * Căutarea rapidă de clienți — fluxul principal al recepției (caută client →
 * intră pe fișă → înrolare/încasare). Logica stă aici ca s-o folosească atât
 * dropdown-ul din bara desktop, cât și ecranul de căutare de pe telefon.
 */
export function useClientSearch(delayMs = 250) {
  const [input, setInput] = useState('')
  const [term, setTerm] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), delayMs)
    return () => clearTimeout(t)
  }, [input, delayMs])

  const { data, isFetching } = useQuery({
    queryKey: ['client-search', term],
    queryFn: () => listClienti({ search: term, page: 0 }),
    enabled: term.length >= MIN_CHARS,
  })

  return {
    input,
    setInput,
    term,
    /** True cât timp textul e prea scurt ca să pornească o căutare. */
    tooShort: term.length < MIN_CHARS,
    results: (data?.rows ?? []).slice(0, MAX_RESULTS),
    isFetching,
    reset: () => {
      setInput('')
      setTerm('')
    },
  }
}
