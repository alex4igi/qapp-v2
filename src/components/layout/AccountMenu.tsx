import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute, isFrontDesk, ROLE_LABEL } from '@/lib/rolesMatrix'
import { AppFeedbackModal } from '@/features/feedback-app/AppFeedbackModal'
import { ComposeAnuntModal } from '@/features/announcements/ComposeAnuntModal'

function initials(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

const itemClass =
  'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-quasar-black transition-colors hover:bg-quasar-gray-light'

export function AccountMenu() {
  const { user, role, signOut, endShift } = useAuth()
  const [open, setOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [anuntOpen, setAnuntOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const showAnunturi = canAccessRoute(role, '/anunturi')
  const showEndShift = isFrontDesk(role)

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
            className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-md border border-quasar-gray-light bg-white shadow-lg"
          >
            <div className="border-b border-quasar-gray-light px-4 py-3">
              <div className="truncate text-sm font-medium text-quasar-black" title={user?.email}>
                {user?.email}
              </div>
              <span className="mt-1 inline-block rounded bg-quasar-black px-1.5 py-0.5 text-xs font-medium text-quasar-yellow">
                {ROLE_LABEL[role]}
              </span>
            </div>

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setOpen(false)
                  setFeedbackOpen(true)
                }}
              >
                <span aria-hidden>💬</span>
                <span>Trimite feedback</span>
              </button>
              {showAnunturi && (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false)
                    setAnuntOpen(true)
                  }}
                >
                  <span aria-hidden>📢</span>
                  <span>Anunț nou</span>
                </button>
              )}
            </div>

            <div className="border-t border-quasar-gray-light py-1">
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

      {feedbackOpen && <AppFeedbackModal open onClose={() => setFeedbackOpen(false)} />}
      {anuntOpen && <ComposeAnuntModal open onClose={() => setAnuntOpen(false)} />}
    </>
  )
}
