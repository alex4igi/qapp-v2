import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useIsMobile'

type Props = {
  /** Eticheta secțiunii din breadcrumb (ex: „Clienți", „Studio"). */
  section?: string
  /** Fallback dacă pagina a fost deschisă direct (deep-link / refresh), fără istoric. */
  backTo: string
  title: string
  actions?: ReactNode
  /** Cardul de identitate din stânga. */
  sidebar: ReactNode
  /** Conținutul cu tab-uri din dreapta. */
  children: ReactNode
  /**
   * Pe telefon cardul de identitate îl randează pagina, ca tab propriu. Fără
   * asta s-ar repeta sub fiecare tab și ar împinge conținutul util în jos.
   */
  mobileSidebarInTab?: boolean
}

// Schelet comun pentru fișele de entitate (Client / Familie / Curs / Teacher):
// header cu breadcrumb + acțiuni, apoi layout 2 coloane (identitate | conținut).
export function ProfileScaffold({
  section,
  backTo,
  title,
  actions,
  sidebar,
  children,
  mobileSidebarInTab = false,
}: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  // „Back" = pagina anterioară din istoric. Dacă fișa a fost deschisă direct
  // (location.key === 'default' ⇒ fără istoric intern), cădem pe backTo.
  const goBack = () =>
    location.key === 'default' ? navigate(backTo) : navigate(-1)
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 max-md:gap-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-card px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          ‹ {section ?? 'Înapoi'}
        </button>
        <span className="text-line max-md:hidden" aria-hidden>
          /
        </span>
        <h1 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-ink max-md:flex-1 max-md:text-lg">
          {title}
        </h1>
        {actions && (
          <>
            <div className="flex-1 max-md:hidden" />
            {/* Pe telefon acțiunile stau pe un singur rând, împărțind lățimea. */}
            <div className="flex flex-wrap gap-2 max-md:w-full max-md:flex-nowrap max-md:[&>*]:min-w-0 max-md:[&>*]:flex-1">
              {actions}
            </div>
          </>
        )}
      </div>

      <div className="grid items-start gap-6 max-md:gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Pe telefon: fie îl ia pagina ca tab, fie trece sub conținut — 300px
            de identitate înaintea tab-urilor ar împinge tot ce e util sub fold. */}
        {isMobile && mobileSidebarInTab ? null : (
          <div className="max-md:order-2">{sidebar}</div>
        )}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
