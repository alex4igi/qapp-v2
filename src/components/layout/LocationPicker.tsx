import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'

/**
 * Selector locație de lucru. Folosit în bara de sus (desktop) și în meniul
 * shell-ului mobil. Când contul are locație impusă din `app_metadata`, se
 * randează ca etichetă, nu ca select.
 */
export function LocationPicker({ className = '' }: { className?: string }) {
  const { locatieId, setLocatieId, options, locatieNume, locked } =
    useWorkingLocatie()

  const dot = (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-quasar-yellow shadow-[0_0_0_3px_rgba(255,214,0,0.25)]" />
  )

  if (locked) {
    return (
      <div
        className={`flex h-10 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-sm font-medium text-ink ${className}`}
        title="Locația ta este setată de admin"
      >
        {dot}
        {locatieNume ?? '—'}
      </div>
    )
  }
  return (
    <label
      className={`flex h-10 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-sm font-medium text-ink focus-within:border-quasar-yellow ${className}`}
      title="Locația de lucru — filtrează cursuri/prezențe/încasări"
    >
      {dot}
      <select
        value={locatieId ?? '__all__'}
        onChange={(e) =>
          setLocatieId(e.target.value === '__all__' ? null : e.target.value)
        }
        className="w-full bg-transparent text-sm text-ink outline-none"
      >
        <option value="__all__">Toate locațiile</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
