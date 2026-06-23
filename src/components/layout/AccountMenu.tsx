import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, isFrontDesk, ROLE_LABEL } from '@/lib/rolesMatrix'

function initials(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

const itemClass =
  'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-quasar-black transition-colors hover:bg-gray-100'

export function AccountMenu() {
  const { user, role, signOut, endShift } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const showFeedback = canAccessRoute(role, '/feedback-app')
  const showAnunturi = canAccessRoute(role, '/anunturi')
  const showEndShift = isFrontDesk(role)

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

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-quasar-black text-sm font-bold text-quasar-yellow ring-1 ring-quasar-yellow-dark transition-shadow hover:ring-2"
          title={user?.email ?? 'Cont'}
          aria-label="Meniu cont"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {initials(user?.email)}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="truncate text-sm font-medium text-quasar-black" title={user?.email}>
                {user?.email}
              </div>
              <span className="mt-1 inline-block rounded bg-quasar-black px-1.5 py-0.5 text-xs font-medium text-quasar-yellow">
                {ROLE_LABEL[role]}
              </span>
            </div>

            <div className="py-1">
              {showFeedback && (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => go('/feedback-app')}
                >
                  <span aria-hidden>💬</span>
                  <span>Feedback aplicație</span>
                </button>
              )}
              {showAnunturi && (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => go('/anunturi')}
                >
                  <span aria-hidden>📢</span>
                  <span>Anunțuri</span>
                </button>
              )}
            </div>

            <div className="border-t border-gray-200 py-1">
              {showEndShift && (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => void endShift()}
                  title="Înregistrează plecarea + sign-out"
                >
                  <span aria-hidden>🏁</span>
                  <span>Încheie tura</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => void signOut()}
              >
                <span aria-hidden>↪</span>
                <span>Ieșire</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
