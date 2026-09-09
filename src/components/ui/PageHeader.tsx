import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink max-md:text-xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2 md:shrink-0">{actions}</div>
      )}
    </div>
  )
}
