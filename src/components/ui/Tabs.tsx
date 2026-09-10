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
    // Pe ecran îngust tab-urile ies din lățime; se derulează în loc să se rupă.
    // `overflow-y-hidden` e obligatoriu: CSS promovează axa rămasă `visible` la
    // `auto`, deci doar `overflow-x-auto` ar fi dat și derulare verticală pe un
    // rând de text — exact ce nu vrei când tragi lateral cu degetul.
    <div className="hide-scrollbar mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line max-md:-mx-4 max-md:px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={[
            '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors',
            tab.id === active
              ? 'border-quasar-yellow font-semibold text-ink'
              : 'border-transparent font-medium text-muted-2 hover:text-ink',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
