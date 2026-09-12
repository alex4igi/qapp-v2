import type { ReactNode } from 'react'

type Props = {
  title: string
  // O propoziție care spune ce e cifra, ca să nu fie nevoie de legendă separată.
  note?: string
  actions?: ReactNode
  children: ReactNode
}

export function Section({ title, note, actions, children }: Props) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            {title}
          </h2>
          {note && <p className="mt-1 max-w-[70ch] text-sm text-muted-2">{note}</p>}
        </div>
        {actions && <div className="md:shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
