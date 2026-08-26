import type { Rezultat, Severitate, StareItem } from '@/lib/checklist'

type Props = {
  rezultat: Rezultat
  titlu?: string
}

const BARA: Record<string, string> = {
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-neutral',
  brand: 'bg-quasar-yellow',
}

function Rand({ item }: { item: StareItem }) {
  const marcaj = item.completat ? '✓' : item.severitate === 'esential' ? '🔴' : '🟡'
  return (
    <li
      className={`flex items-start gap-2 text-xs leading-snug ${
        item.completat ? 'text-muted' : 'font-medium text-ink'
      }`}
      title={item.completat ? undefined : item.motiv}
    >
      <span className={`shrink-0 ${item.completat ? 'text-success' : ''}`}>
        {marcaj}
      </span>
      <span className="min-w-0">{item.eticheta}</span>
    </li>
  )
}

function Grup({
  titlu,
  items,
}: {
  titlu: string
  items: StareItem[]
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {titlu}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <Rand key={item.id} item={item} />
        ))}
      </ul>
    </div>
  )
}

// Varianta live pentru interiorul unui modal: arată TOȚI itemii, nu doar cei
// lipsă — sensul rail-ului e să-i vezi bifându-se pe măsură ce completezi.
// Fără butoane de fix: câmpurile sunt deja pe ecran, în stânga.
export function ChecklistRail({ rezultat, titlu = 'Completare fișă' }: Props) {
  const dupaSeveritate = (s: Severitate) =>
    rezultat.aplicabile.filter((i) => i.severitate === s)

  return (
    <aside className="rounded-xl border border-line bg-surface p-4 md:sticky md:top-0">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xs font-bold text-ink">{titlu}</p>
        <span className="text-[11px] font-semibold text-muted-2">
          {rezultat.completate}/{rezultat.total}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-quasar-gray-light">
        <div
          className={`h-full rounded-full transition-all ${BARA[rezultat.tone] ?? 'bg-neutral'}`}
          style={{ width: `${rezultat.procent}%` }}
        />
      </div>

      <Grup titlu="Esențiale" items={dupaSeveritate('esential')} />
      <Grup titlu="Recomandate" items={dupaSeveritate('recomandat')} />
    </aside>
  )
}
