import type { Rezultat } from '@/lib/checklist'

// Bucățile vizuale comune secțiunilor paginii (o secțiune per entitate), ca
// numărătorile și chip-urile să arate la fel oriunde.

export function Contor({
  valoare,
  eticheta,
  tone,
}: {
  valoare: number
  eticheta: string
  tone: 'danger' | 'warn' | 'success'
}) {
  const culoare =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : 'text-success'
  return (
    <div className="flex-1 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <p className={`font-display text-2xl font-bold ${culoare}`}>{valoare}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-2">{eticheta}</p>
    </div>
  )
}

export function Chips({ rez }: { rez: Rezultat }) {
  const lipsa = [...rez.lipsaEsentiale, ...rez.lipsaRecomandate]
  return (
    <div className="flex flex-wrap gap-1">
      {lipsa.map((s) => (
        <span
          key={s.id}
          title={s.motiv}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            s.severitate === 'esential'
              ? 'bg-danger-bg text-danger'
              : 'bg-warn-bg text-warn'
          }`}
        >
          {s.eticheta}
        </span>
      ))}
    </div>
  )
}
