import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, roleLabel } from '@/lib/rolesMatrix'
import { ClientForm } from '@/features/clienti/ClientForm'
import { LeadModal } from '@/features/leads/LeadModal'
import { sectionMatches, visibleSections } from './navConfig'

/* ---------- iconuri secțiuni ---------- */
function SectionIcon({ label }: { label: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (label) {
    case 'Clienți':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="8.5" r="2.6" />
        </svg>
      )
    case 'Încasări':
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      )
    case 'Cursuri':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M3.5 9h17M9 9v11" />
        </svg>
      )
    case 'Evenimente':
      return (
        <svg {...common}>
          <path d="M12 3.5l2.5 5.3 5.8.8-4.2 4 1 5.7-5.1-2.8-5.1 2.8 1-5.7-4.2-4 5.8-.8z" />
        </svg>
      )
    case 'Marketing':
      return (
        <svg {...common}>
          <path d="M4 10v4l10 4V6z" />
          <path d="M14 8.5a4 4 0 010 7" />
        </svg>
      )
    case 'Rapoarte':
      return (
        <svg {...common}>
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="17" rx="1" />
        </svg>
      )
    case 'Personal':
      return (
        <svg {...common}>
          <circle cx="12" cy="7.5" r="3" />
          <path d="M5.5 20c0-3.3 2.7-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
        </svg>
      )
    case 'Administrare':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}

/* ---------- stare colapsat ---------- */
const COLLAPSED_KEY = 'qapp.rail.collapsed'

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  )
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])
  return [collapsed, setCollapsed] as const
}

/* ---------- nav expandabil ---------- */
function RailNav({
  collapsed,
  onExpand,
}: {
  collapsed: boolean
  onExpand: () => void
}) {
  const { role, teacherId } = useAuth()
  const sections = visibleSections(role, teacherId)
  const location = useLocation()

  // Secțiunea căreia îi aparține ruta curentă (sau null pe rute fără secțiune,
  // ex. dashboard — atunci NIMIC nu e marcat activ).
  const activeLabel =
    sections.find((s) => sectionMatches(s, location.pathname))?.label ?? null
  const [open, setOpen] = useState<string | null>(activeLabel)

  // La navigare către o pagină dintr-o secțiune, deschide acea secțiune.
  // Nu forțăm nimic dacă ruta nu aparține vreunei secțiuni → respectăm clickul.
  useEffect(() => {
    if (activeLabel) setOpen(activeLabel)
  }, [activeLabel])

  // Colapsat: doar iconurile secțiunilor (colorate). Clic pe una redeschide rail-ul
  // cu secțiunea aceea desfăcută; frunza (Administrare) navighează direct.
  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1">
        {sections.map((section) => {
          const hasActive = sectionMatches(section, location.pathname)
          const cls = [
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            hasActive
              ? 'bg-rail-2 text-white'
              : 'hover:bg-rail-2/60 hover:text-white',
          ].join(' ')
          const style = hasActive
            ? { boxShadow: `inset 3px 0 0 ${section.color}` }
            : undefined
          const icon = (
            <span style={{ color: section.color }}>
              <SectionIcon label={section.label} />
            </span>
          )
          if (section.leaf) {
            return (
              <Link
                key={section.label}
                to={section.items[0].path}
                title={section.label}
                aria-label={section.label}
                className={cls}
                style={style}
              >
                {icon}
              </Link>
            )
          }
          return (
            <button
              key={section.label}
              type="button"
              title={section.label}
              aria-label={section.label}
              onClick={() => {
                setOpen(section.label)
                onExpand()
              }}
              className={cls}
              style={style}
            >
              {icon}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-rail-muted">
        Meniu
      </div>
      {sections.map((section) => {
        const isOpen = open === section.label
        const hasActive = sectionMatches(section, location.pathname)
        const icon = (
          <span style={{ color: section.color }}>
            <SectionIcon label={section.label} />
          </span>
        )

        // Frunză (Administrare): un singur rând-link, fără acordeon.
        if (section.leaf) {
          return (
            <NavLink
              key={section.label}
              to={section.items[0].path}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                hasActive
                  ? 'bg-rail-2 text-white'
                  : 'text-rail-soft hover:bg-rail-2/60 hover:text-white',
              ].join(' ')}
              style={hasActive ? { boxShadow: `inset 3px 0 0 ${section.color}` } : undefined}
            >
              {icon}
              <span className="flex-1 text-left">{section.label}</span>
            </NavLink>
          )
        }

        // Evidențiem (bară colorată + fundal) secțiunea deschisă SAU cea a rutei
        // curente — astfel clickul pe meniu aprinde butonul, iar deschiderea
        // altei secțiuni mută evidențierea.
        const highlight = isOpen || hasActive
        return (
          <div key={section.label}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : section.label)}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                highlight
                  ? 'bg-rail-2 text-white'
                  : 'text-rail-soft hover:bg-rail-2/60 hover:text-white',
              ].join(' ')}
              style={highlight ? { boxShadow: `inset 3px 0 0 ${section.color}` } : undefined}
              aria-expanded={isOpen}
            >
              {icon}
              <span className="flex-1 text-left">{section.label}</span>
              <span
                className={[
                  'text-[10px] text-rail-muted transition-transform',
                  isOpen ? 'rotate-180' : '',
                ].join(' ')}
                aria-hidden
              >
                ▾
              </span>
            </button>
            {/* Acordeon animat: grid-rows 0fr→1fr animează înălțimea fără să știm dimensiunea. */}
            <div
              className={[
                'grid transition-[grid-template-rows] duration-200 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              ].join(' ')}
            >
              <div className="overflow-hidden">
                <div className="mb-1 ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-rail-line pl-3">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      tabIndex={isOpen ? 0 : -1}
                      className={({ isActive }) =>
                        [
                          'block truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                          isActive
                            ? ''
                            : 'text-rail-soft hover:bg-rail-2 hover:text-white',
                        ].join(' ')
                      }
                      style={({ isActive }) =>
                        isActive
                          ? {
                              backgroundColor: `color-mix(in srgb, ${section.color} 22%, transparent)`,
                              color: section.color,
                              boxShadow: `inset 2px 0 0 ${section.color}`,
                            }
                          : undefined
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

/* ---------- acțiuni rapide ---------- */
function RailActions({ collapsed }: { collapsed: boolean }) {
  const { role } = useAuth()
  const [leadOpen, setLeadOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  if (role === 'teacher') return null

  if (collapsed) {
    return (
      <>
        <div className="mt-2 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setClientOpen(true)}
            title="Client nou"
            aria-label="Client nou"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-quasar-yellow text-base font-bold text-ink transition-colors hover:bg-quasar-yellow-dark"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setLeadOpen(true)}
            title="Lead nou"
            aria-label="Lead nou"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-rail-line text-[11px] font-bold text-rail-soft transition-colors hover:border-rail-soft hover:text-white"
          >
            +L
          </button>
        </div>

        {leadOpen && <LeadModal open onClose={() => setLeadOpen(false)} />}
        {clientOpen && <ClientForm open onClose={() => setClientOpen(false)} />}
      </>
    )
  }

  return (
    <>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setClientOpen(true)}
          className="flex h-9 flex-1 items-center justify-center rounded-[10px] bg-quasar-yellow text-[12.5px] font-bold text-ink transition-colors hover:bg-quasar-yellow-dark"
        >
          + Client
        </button>
        <button
          type="button"
          onClick={() => setLeadOpen(true)}
          className="flex h-9 flex-1 items-center justify-center rounded-[10px] border border-rail-line bg-transparent text-[12.5px] font-semibold text-rail-soft transition-colors hover:border-rail-soft hover:text-white"
        >
          + Lead
        </button>
      </div>

      {leadOpen && <LeadModal open onClose={() => setLeadOpen(false)} />}
      {clientOpen && <ClientForm open onClose={() => setClientOpen(false)} />}
    </>
  )
}

/* ---------- cont (dropdown în sus) ---------- */
function initials(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

function RailAccount({
  collapsed,
  onExpand,
}: {
  collapsed: boolean
  onExpand: () => void
}) {
  const { user, role, teacherId, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const showFeedback = canAccessRoute(role, '/feedback-app')
  const showAnunturi = canAccessRoute(role, '/anunturi')

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item =
    'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-quasar-gray-light'

  // Colapsat: dropdown-ul (mai lat decât rail-ul) ar fi tăiat de overflow-ul
  // aside-ului, deci clicul pe avatar doar redeschide rail-ul.
  if (collapsed) {
    return (
      <div className="mt-4 flex justify-center border-t border-rail-line pt-4">
        <button
          type="button"
          onClick={onExpand}
          title={user?.email ?? 'Cont'}
          aria-label="Cont"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-quasar-yellow text-[11px] font-bold text-ink"
        >
          {initials(user?.email)}
        </button>
      </div>
    )
  }

  return (
    <div className="relative mt-4 border-t border-rail-line pt-4" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-rail-2"
        title={user?.email ?? 'Cont'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-quasar-yellow text-[11px] font-bold text-ink">
          {initials(user?.email)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[12.5px] font-semibold text-white">
            {user?.email?.split('@')[0] ?? 'Cont'}
          </span>
          <span className="block text-[11px] text-rail-muted">
            {roleLabel(role, teacherId)}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <div className="truncate text-sm font-medium text-ink" title={user?.email}>
              {user?.email}
            </div>
            <span className="mt-1 inline-block rounded bg-ink px-1.5 py-0.5 text-xs font-medium text-quasar-yellow">
              {roleLabel(role, teacherId)}
            </span>
          </div>
          <div className="py-1">
            <a
              href="/prezentari/index.html"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className={item}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden>📚</span>
              <span>Ghiduri & manual</span>
            </a>
            {showFeedback && (
              <button type="button" role="menuitem" className={item} onClick={() => go('/feedback-app')}>
                <span aria-hidden>💬</span>
                <span>Feedback aplicație</span>
              </button>
            )}
            {showAnunturi && (
              <button type="button" role="menuitem" className={item} onClick={() => go('/anunturi')}>
                <span aria-hidden>📢</span>
                <span>Anunțuri</span>
              </button>
            )}
          </div>
          <div className="border-t border-line py-1">
            <button type="button" role="menuitem" className={item} onClick={() => void signOut()}>
              <span aria-hidden>↪</span>
              <span>Ieșire</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- rail ---------- */
export function Rail(): ReactNode {
  const [collapsed, setCollapsed] = useCollapsed()
  const expand = () => setCollapsed(false)

  return (
    // Wrapper fără overflow: butonul de pe muchie iese pe jumătate din rail,
    // iar aside-ul (care scrollează) l-ar tăia dacă ar sta înăuntru.
    <div
      className={[
        'group relative shrink-0',
        'motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out',
        collapsed ? 'w-[64px]' : 'w-[236px]',
      ].join(' ')}
    >
      <aside
        className={[
          'flex h-full w-full flex-col overflow-y-auto overflow-x-hidden bg-rail py-5 text-white',
          // Gutter-ul de scrollbar ar mânca 15px din cei 64 și ar turti iconurile.
          collapsed ? 'px-2' : 'px-4 [scrollbar-gutter:stable]',
        ].join(' ')}
      >
        {collapsed ? (
          <Link to="/" className="mb-5 flex justify-center" title="Acasă">
            <img
              src="/favicon.png"
              alt="Quasar Dance"
              className="h-9 w-9 shrink-0 select-none"
              draggable={false}
            />
          </Link>
        ) : (
          <Link to="/" className="mb-5 flex items-center px-1.5" title="Acasă">
            <img
              src="/logo-q-a-l-contur.png"
              alt="Quasar Dance"
              className="h-12 w-auto select-none"
              draggable={false}
            />
          </Link>
        )}

        <RailNav collapsed={collapsed} onExpand={expand} />

        <div className="flex-1" />

        <RailActions collapsed={collapsed} />
        <RailAccount collapsed={collapsed} onExpand={expand} />
      </aside>

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Afișează meniul' : 'Ascunde meniul'}
        aria-label={collapsed ? 'Afișează meniul' : 'Ascunde meniul'}
        aria-expanded={!collapsed}
        className="absolute right-0 top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-rail-line bg-rail text-sm leading-none text-rail-muted shadow-md transition-colors hover:bg-rail-2 hover:text-white"
      >
        <span aria-hidden>{collapsed ? '›' : '‹'}</span>
      </button>
    </div>
  )
}
