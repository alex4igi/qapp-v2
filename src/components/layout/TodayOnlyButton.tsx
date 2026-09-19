import { useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useTodayOnly } from '@/hooks/useTodayOnly'
import { isMarketing } from '@/lib/rolesMatrix'

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/**
 * Butonul roșu: restrânge aplicația la ziua curentă până la următoarea logare.
 * Odată pornit, în locul lui stă eticheta „Doar azi" — singura ieșire e delogarea.
 */
export function TodayOnlyButton() {
  const { role, signOut } = useAuth()
  const { active, activate } = useTodayOnly()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)

  // Agenția de ads nu lucrează „ziua" — aterizează pe /marketing, în afara listei albe.
  if (isMarketing(role)) return null

  if (active) {
    return (
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              'Ieși din modul „doar azi"? Te deloghează; după ce te loghezi din nou, aplicația revine completă.',
            )
          ) {
            void signOut()
          }
        }}
        title="Aplicația arată doar ziua de azi. Revine completă după delogare și logare."
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-danger px-2.5 text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger/5"
      >
        <LockIcon />
        Doar azi
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title="Doar azi — restrânge aplicația la ziua curentă"
        aria-label="Doar azi — restrânge aplicația la ziua curentă"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger text-white shadow-sm transition hover:brightness-95"
      >
        <LockIcon />
      </button>

      <Modal
        open={confirmOpen}
        title="Doar ziua de azi"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Renunță
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                setPending(true)
                void activate()
              }}
            >
              {pending ? 'Se activează…' : 'Activează'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink">
          <p>
            Aplicația rămâne doar cu <strong>ziua curentă de lucru</strong>:
            programul de azi, prezența și încasările zilei.
          </p>
          <p className="text-muted-2">
            Dispar zilele anterioare, statisticile, istoricul, fișele și căutarea
            de clienți. Nu se șterge și nu se modifică nimic.
          </p>
          <p className="text-muted-2">
            Revii la aplicația completă doar prin{' '}
            <strong className="text-ink">delogare și logare din nou</strong>.
          </p>
        </div>
      </Modal>
    </>
  )
}
