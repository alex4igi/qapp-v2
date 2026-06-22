type Tab = {
  id: string
  label: string
}

type Props = {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="mb-4 flex gap-1 border-b border-quasar-gray-light">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={[
            '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
            tab.id === active
              ? 'border-quasar-yellow font-semibold text-quasar-black'
              : 'border-transparent font-medium text-quasar-gray hover:text-quasar-black',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
