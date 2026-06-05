import { tipTabs, type TipPlata } from './helpers'

type Props = {
  value: TipPlata
  onChange: (tip: TipPlata) => void
}

export function TipSelector({ value, onChange }: Props) {
  return (
    <div className="mb-4 flex gap-1 border-b border-quasar-gray-light">
      {tipTabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={[
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            t.id === value
              ? 'border-quasar-yellow text-quasar-black'
              : 'border-transparent text-quasar-gray hover:text-quasar-black',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
