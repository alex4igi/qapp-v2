import type { ReactNode } from 'react'

type Props = {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function Field({ label, htmlFor, error, required, children }: Props) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-ink"
      >
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
