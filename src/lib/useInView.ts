import { useEffect, useRef, useState } from 'react'

type Options = {
  rootMargin?: string
  triggerOnce?: boolean
}

// App-ul derulează într-un container interior (main.qcontent), nu în viewport.
// Cu root:null intersecția e TĂIATĂ de containerul de scroll, iar rootMargin nu i
// se aplică — perna de pre-încărcare devine 0px și, la margine de pixel + layout
// shift (secțiunile de sus cresc când se montează), elemente pot fi sărite
// definitiv. Root-ul corect e strămoșul scrollabil.
function nearestScrollRoot(el: HTMLElement): Element | null {
  let p = el.parentElement
  while (p) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
    p = p.parentElement
  }
  return null
}

/** Observă când un element intră în zona vizibilă a containerului de scroll. Implicit pre-încarcă cu 200px înainte și nu mai resetează. */
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
      { root: nearestScrollRoot(el), rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rootMargin, triggerOnce, inView])

  return { ref, inView }
}
