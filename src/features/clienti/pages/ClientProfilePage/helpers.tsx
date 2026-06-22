import { Link } from 'react-router-dom'

const RO_MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

export function formatLuna(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${RO_MONTHS[m - 1]} ${y}`
}

export function calcAge(dataNasterii: string | null): number | null {
  if (!dataNasterii) return null
  const [y, m, d] = dataNasterii.split('-').map(Number)
  const birth = new Date(y, m - 1, d)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const mo = today.getMonth() - birth.getMonth()
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function getInitials(nume: string | null, prenume: string | null): string {
  const a = nume?.trim().charAt(0) ?? ''
  const b = prenume?.trim().charAt(0) ?? ''
  return (a + b).toUpperCase() || '?'
}

export function DetailRow({
  label,
  value,
  to,
}: {
  label: string
  value: string
  to?: string
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-quasar-gray">{label}</dt>
      <dd className="text-sm break-words text-quasar-black">
        {to && value ? (
          <Link
            to={to}
            className="underline decoration-quasar-yellow decoration-2 underline-offset-2 hover:text-quasar-gray"
          >
            {value}
          </Link>
        ) : (
          value || '—'
        )}
      </dd>
    </div>
  )
}

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-display text-sm font-bold text-quasar-black">{title}</h2>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">{children}</dl>
    </div>
  )
}
