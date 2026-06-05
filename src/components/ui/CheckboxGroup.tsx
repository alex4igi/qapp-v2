import type { SelectOption } from './Select'

type Props = {
  options: SelectOption[]
  value: string[]
  onChange: (value: string[]) => void
}

export function CheckboxGroup({ options, value, onChange }: Props) {
  const toggle = (val: string) => {
    onChange(
      value.includes(val)
        ? value.filter((v) => v !== val)
        : [...value, val],
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={[
              'rounded-md border px-2.5 py-1 text-sm transition-colors',
              active
                ? 'border-quasar-yellow bg-quasar-yellow font-medium text-quasar-black'
                : 'border-quasar-gray-light bg-white text-quasar-gray hover:bg-quasar-gray-light',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
