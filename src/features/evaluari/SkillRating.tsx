import { SCALE_LEFT, SCALE_RIGHT } from './skills'

type Props = {
  label: string
  value: number | null
  onChange: (v: number) => void
}

export function SkillRating({ label, value, onChange }: Props) {
  return (
    <div className="rounded-md border border-quasar-gray-light bg-white px-4 py-3">
      <p className="mb-2 text-sm font-medium text-quasar-black">{label}</p>
      <div className="flex items-center gap-3 text-xs text-quasar-gray">
        <span className="w-28 shrink-0 text-right">{SCALE_LEFT}</span>
        <div className="flex flex-1 items-center justify-between">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = value === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                aria-label={`Nivel ${n}`}
                className={[
                  'h-8 w-8 rounded-full border text-sm font-medium transition-colors',
                  selected
                    ? 'border-quasar-black bg-quasar-yellow text-quasar-black'
                    : 'border-quasar-gray-light bg-white text-quasar-gray hover:border-quasar-black',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
        </div>
        <span className="w-28 shrink-0">{SCALE_RIGHT}</span>
      </div>
    </div>
  )
}
