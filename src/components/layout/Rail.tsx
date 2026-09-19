import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { canAccessRoute, canEditLeads, roleLabel } from '@/lib/rolesMatrix'
import { isForcedDesktop, isNarrowViewport, setForceDesktop } from '@/hooks/useIsMobile'
import { initialsFromEmail } from './accountInitials'
import { SectionIcon } from './SectionIcon'
import { sectionMatches, visibleSections } from './navConfig'

// Cele două modale de „adaugă rapid" se deschid rar, dar importate static trăgeau în
// bundle-ul inițial toată logica de leads + clienți. Se încarcă la primul click.
const ClientForm = lazy(() =>
  import('@/features/clienti/ClientForm').then((m) => ({ default: m.ClientForm })),
)
const LeadModal = lazy(() =>
  import('@/features/leads/LeadModal').then((m) => ({ default: m.LeadModal })),
)

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
  const { active: todayOnly } = useTodayOnly()
  const sections = visibleSections(role, teacherId, todayOnly)
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
  const { active: todayOnly } = useTodayOnly()
  const [leadOpen, setLeadOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  // Cine nu poate scrie lead-uri/clienți nu vede nici scurtăturile de creare
  // (teacher, agenția de ads). În modul „doar azi" dispar și ele: ambele duc pe
  // fișe (client, lead), adică exact în istoricul pe care modul îl închide.
  if (!canEditLeads(role) || todayOnly) return null

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

        <Suspense fallback={null}>
          {leadOpen && <LeadModal open onClose={() => setLeadOpen(false)} />}
          {clientOpen && <ClientForm open onClose={() => setClientOpen(false)} />}
        </Suspense>
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

      <Suspense fallback={null}>
        {leadOpen && <LeadModal open onClose={() => setLeadOpen(false)} />}
        {clientOpen && <ClientForm open onClose={() => setClientOpen(false)} />}
      </Suspense>
    </>
  )
}

/* ---------- cont (dropdown în sus) ---------- */

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
  // Ecran îngust + desktop forțat = omul a ieșit manual din shell-ul mobil.
  // Îi lăsăm drumul înapoi; pe un monitor adevărat opțiunea n-are ce căuta.
  const showMobileSwitch = isForcedDesktop() && isNarrowViewport()

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
          {initialsFromEmail(user?.email)}
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
          {initialsFromEmail(user?.email)}
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
            {showMobileSwitch && (
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setOpen(false)
                  setForceDesktop(false)
                }}
              >
                <span aria-hidden>📱</span>
                <span>Versiunea mobilă</span>
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
