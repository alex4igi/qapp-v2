import type { ReactNode } from 'react'
import { Spinner } from '@/components/ui'
import { useInView } from '@/lib/useInView'

/** Opțiuni implicite pentru query-urile de analytics: datele de management nu se schimbă de la secundă la secundă. */
export const ANALYTICS_QO = { staleTime: 5 * 60_000 } as const

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold text-quasar-black">{children}</h2>
      {sub && <p className="text-xs text-quasar-gray">{sub}</p>}
    </div>
  )
}

/** Montează `children` (și pornește query-urile lor) abia când secțiunea intră în viewport. */
export function LazySection({ minHeight = 320, children }: { minHeight?: number; children: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div ref={ref}>
      {inView ? (
        children
      ) : (
        <div className="flex items-center justify-center" style={{ minHeight }}>
          <Spinner />
        </div>
      )}
    </div>
  )
}
