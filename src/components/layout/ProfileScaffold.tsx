import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = {
  /** Eticheta secțiunii din breadcrumb (ex: „Clienți", „Studio"). */
  section?: string
  /** Ținta butonului de back din breadcrumb. */
  backTo: string
  title: string
  actions?: ReactNode
  /** Cardul de identitate din stânga. */
  sidebar: ReactNode
  /** Conținutul cu tab-uri din dreapta. */
  children: ReactNode
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
}: Props) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          to={backTo}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-card px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          ‹ {section ?? 'Înapoi'}
        </Link>
        <span className="text-line" aria-hidden>
          /
        </span>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">
          {title}
        </h1>
        {actions && (
          <>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-2">{actions}</div>
          </>
        )}
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        {sidebar}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
