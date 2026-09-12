import type { ReactNode } from 'react'
import { resetAuthSession, useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/layout/Logo'

/**
 * Ultima plasă de siguranță la pornire: când nici după tot bugetul lui `auth-js`
 * nu știm dacă există sesiune, arată o ieșire în loc de „Se încarcă…" la
 * nesfârșit. Reîncercarea e acțiunea principală, nu delogarea: de cele mai multe
 * ori sesiunea e bună și doar reînnoirea a întârziat.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const { authStalled, stallReason } = useAuth()

  if (!authStalled) return <>{children}</>

  return (
    <div className="flex h-screen items-center justify-center bg-quasar-gray-light p-4">
      <div className="w-full max-w-sm rounded-xl border border-quasar-gray-light bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <span className="rounded-md bg-quasar-black px-3 py-1.5">
            <Logo />
          </span>
        </div>
        <h1 className="mb-2 text-lg font-bold text-quasar-black">
          Sesiunea nu s-a putut confirma
        </h1>
        <p className="mb-6 text-sm text-quasar-gray">
          Serverul nu a răspuns la timp. Sesiunea ta e cel mai probabil în
          regulă — încearcă din nou, datele tale nu sunt afectate.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full rounded-md bg-quasar-yellow py-2 font-semibold text-quasar-black transition-colors hover:bg-quasar-yellow-dark"
        >
          Încearcă din nou
        </button>
        <button
          type="button"
          onClick={resetAuthSession}
          className="mt-3 w-full rounded-md py-2 text-sm text-quasar-gray underline transition-colors hover:text-quasar-black"
        >
          Tot nu merge — ieși din cont
        </button>
        {stallReason && (
          <p className="mt-5 border-t border-quasar-gray-light pt-4 text-xs text-quasar-gray">
            {stallReason}
          </p>
        )}
      </div>
    </div>
  )
}
