import type { ReactNode } from 'react'

/** Opțiuni implicite pentru query-urile de analytics: datele de management nu se schimbă de la secundă la secundă. */
export const ANALYTICS_QO = { staleTime: 5 * 60_000 } as const

export function SectionTitle({ children, sub, badge }: { children: ReactNode; sub?: string; badge?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center text-base font-bold text-quasar-black">
        {children}
        {badge}
      </h2>
      {sub && <p className="text-xs text-quasar-gray">{sub}</p>}
    </div>
  )
}

/** Marchează un număr care ignoră selectorul de Locație (ex. cheltuieli fără dimensiune de locație). */
export function TotClubulBadge() {
  return (
    <span
      className="ml-2 inline-flex shrink-0 items-center rounded-full bg-quasar-gray-light px-2 py-0.5 align-middle text-[10px] font-medium text-quasar-gray"
      title="Acest număr se calculează pe tot clubul, indiferent de locația selectată"
    >
      tot clubul
    </span>
  )
}
