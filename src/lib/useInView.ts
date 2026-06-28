import { useEffect, useRef, useState } from 'react'

type Options = {
  rootMargin?: string
  triggerOnce?: boolean
}

/** Observă când un element intră în viewport. Implicit pre-încarcă cu 200px înainte și nu mai resetează. */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  rootMargin = '200px',
  triggerOnce = true,
}: Options = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || (triggerOnce && inView)) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (triggerOnce) obs.disconnect()
        } else if (!triggerOnce) {
          setInView(false)
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rootMargin, triggerOnce, inView])

  return { ref, inView }
}
