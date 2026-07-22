import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type SelectOption = {
  label: string
  value: string
  // Sub-text afișat de Combobox (ignorat de Select). Util pentru a diferenția
  // opțiuni cu același label (ex: 2 familii cu același nume).
  secondary?: string
  // Antet de grup afișat de Select ca <optgroup> (ignorat de Combobox). Grupurile
  // se formează din secvențe consecutive cu aceeași valoare, deci ordinea dată de
  // producător e păstrată ca atare.
  group?: string
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[]
  placeholder?: string
}

export function Select({ options, placeholder, className, ...rest }: Props) {
  return (
    <select
      className={cn(
        // h-[38px] = aceeași înălțime ca TextInput (select-ul nativ ignoră line-height, deci o fixăm)
        'h-[38px] w-full rounded-[10px] border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
        className,
      )}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {groupRuns(options).map((run, i) =>
        run.group === undefined ? (
          run.items.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        ) : (
          <optgroup key={`${run.group}-${i}`} label={run.group}>
            {run.items.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </select>
  )
}

// Împarte opțiunile în secvențe consecutive cu același `group`.
function groupRuns(
  options: SelectOption[],
): { group: string | undefined; items: SelectOption[] }[] {
  const runs: { group: string | undefined; items: SelectOption[] }[] = []
  for (const opt of options) {
    const last = runs[runs.length - 1]
    if (last && last.group === opt.group) last.items.push(opt)
    else runs.push({ group: opt.group, items: [opt] })
  }
  return runs
}
