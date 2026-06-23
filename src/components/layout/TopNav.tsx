import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { visibleSections, type NavSection } from './navConfig'

function SectionTab({ section }: { section: NavSection }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={[
          'min-w-32 rounded-t-lg px-6 py-3 text-base font-semibold text-quasar-black tracking-wide transition-colors',
          open
            ? 'bg-white shadow'
            : 'bg-white/80 hover:bg-white',
        ].join(' ')}
      >
        {section.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 min-w-48 rounded-b-xl rounded-tr-xl border border-gray-200 bg-white py-1 shadow-lg">
          {section.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                [
                  'block px-4 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-quasar-yellow text-quasar-black'
                    : 'text-quasar-black hover:bg-quasar-gray-light',
                ].join(' ')
              }
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopNav() {
  const { role } = useAuth()
  const sections = visibleSections(role)

  // Pentru rolul teacher, e probabil o singură secțiune cu un singur item
  // (Evaluări). Îl arătăm ca un link plat în loc de dropdown.
  if (role === 'teacher' && sections.length === 1 && sections[0].items.length === 1) {
    const item = sections[0].items[0]
    return (
      <nav className="flex items-center gap-1">
        <NavLink
          to={item.path}
          className={({ isActive }) =>
            [
              'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-quasar-yellow text-quasar-black'
                : 'text-quasar-black hover:bg-white',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      </nav>
    )
  }

  return (
    <nav className="flex items-end gap-1">
      {sections.map((s) => (
        <SectionTab key={s.label} section={s} />
      ))}
    </nav>
  )
}
