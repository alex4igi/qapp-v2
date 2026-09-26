import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LazySection } from '@/components/ui'
import { lunaCurenta, lunaCuOffset } from '@/features/statistici/api'
import { getConversieLeads } from '@/features/ansamblu/api'
import { ANALYTICS_QO } from './sections/shared'
import { Section2Achizitie } from './sections/Section2Achizitie'
import { Section4Economie } from './sections/Section4Economie'
import { Section5Venituri } from './sections/Section5Venituri'
import { Section6Oameni } from './sections/Section6Oameni'
import { Section7Scoala } from './sections/Section7Scoala'

// Graficele vechi care încă sunt corecte, păstrate până le înlocuiesc taburile
// (Cursanți / Înscrieri / Grupe / Bani), construite doar când lipsesc cuiva.
// Închis implicit și montat abia la deschidere, ca să nu pornească cereri degeaba.
export function DetaliiInRevizuire({ locatieId, locatieNume }: { locatieId: string | null; locatieNume: string | null }) {
  const [deschis, setDeschis] = useState(false)
  const interval = useMemo(() => ({ fromLuna: lunaCuOffset(-11), toLuna: lunaCurenta() }), [])
  const conversieQ = useQuery({
    queryKey: ['an', 'conversie', locatieNume],
    queryFn: () => getConversieLeads(12, locatieNume),
    enabled: deschis,
    ...ANALYTICS_QO,
  })

  return (
    <details
      className="rounded-2xl border border-line bg-card p-5"
      onToggle={(e) => setDeschis((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        Detalii (în revizuire)
        <span className="ml-2 font-normal text-muted-2">
          leaduri, grupe, venituri, instructori, încasări pe sezon — ultimele 12 luni
        </span>
      </summary>
      {deschis && (
        <div className="mt-6 flex flex-col gap-10">
          <LazySection>
            <Section2Achizitie
              interval={interval}
              scope={locatieId}
              locatieId={locatieId ?? ''}
              locatieLabel={locatieNume}
              conversie={conversieQ.data}
            />
          </LazySection>
          <LazySection>
            <Section4Economie scope={locatieId} />
          </LazySection>
          <LazySection>
            <Section5Venituri interval={interval} scope={locatieId} />
          </LazySection>
          <LazySection>
            <Section6Oameni scoped={!!locatieId} />
          </LazySection>
          <LazySection>
            <Section7Scoala scoped={!!locatieId} />
          </LazySection>
        </div>
      )}
    </details>
  )
}
