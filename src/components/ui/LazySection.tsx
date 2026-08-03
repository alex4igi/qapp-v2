import type { ReactNode } from 'react'
import { Spinner } from './Spinner'
import { useInView } from '@/lib/useInView'

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
