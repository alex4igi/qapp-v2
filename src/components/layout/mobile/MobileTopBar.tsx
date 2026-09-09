import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { useUnreadCount } from '../useUnreadCount'

// Rutele de detaliu primesc săgeata de „înapoi". Ținta de rezervă contează:
// instalată pe ecranul principal, aplicația n-are butonul de back al browserului,
// iar un deep-link deschis direct n-are istoric în care să te întorci.
const DETAIL_ROUTES: { prefix: string; fallback: string }[] = [
  { prefix: '/evaluari/grupa/', fallback: '/evaluari' },
  { prefix: '/grupa/', fallback: '/' },
  { prefix: '/clienti/', fallback: '/clienti' },
  { prefix: '/eveniment/', fallback: '/' },
  { prefix: '/familii/', fallback: '/familii' },
  { prefix: '/cursuri/', fallback: '/cursuri' },
  { prefix: '/teacheri/', fallback: '/teacheri' },
  { prefix: '/spectacole/', fallback: '/spectacole' },
  { prefix: '/metodologic/', fallback: '/metodologic' },
]

type Props = {
  onSearch: () => void
  onLocatie: () => void
}

export function MobileTopBar({ onSearch, onLocatie }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { locatieNume } = useWorkingLocatie()
  const { enabled: showNotificari, count: unreadCount } = useUnreadCount()

  const detail = DETAIL_ROUTES.find((r) => location.pathname.startsWith(r.prefix))

  const goBack = () => {
    // `key === 'default'` = prima intrare din istoric (deep-link / refresh):
    // `navigate(-1)` ar ieși din aplicație.
    if (location.key === 'default') navigate(detail?.fallback ?? '/', { replace: true })
    else navigate(-1)
  }

  const btn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-2 transition-colors active:bg-surface'

  return (
    <div className="flex h-13 shrink-0 items-center gap-1 border-b border-line bg-card px-2 pt-[env(safe-area-inset-top)]">
      {detail ? (
        <button type="button" onClick={goBack} className={btn} aria-label="Înapoi">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      ) : (
        <Link to="/" className={`${btn} w-11`} aria-label="Acasă">
          <img
            src="/favicon.png"
            alt="Quasar Dance"
            className="h-8 w-8 select-none"
            draggable={false}
          />
        </Link>
      )}

      <button
        type="button"
        onClick={onLocatie}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors active:bg-surface"
        title="Locația de lucru"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-quasar-yellow shadow-[0_0_0_3px_rgba(255,214,0,0.25)]" />
        <span className="truncate text-[13px] font-semibold text-ink">
          {locatieNume ?? 'Toate locațiile'}
        </span>
      </button>

      <button type="button" onClick={onSearch} className={btn} aria-label="Caută client">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
      </button>

      {showNotificari && (
        <Link
          to="/notificari"
          className={`${btn} relative text-base`}
          aria-label="Notificări"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      )}
    </div>
  )
}
