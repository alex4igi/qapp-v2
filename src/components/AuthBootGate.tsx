import type { ReactNode } from 'react'
import { resetAuthSession, useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/layout/Logo'

/**
 * Ultima plasă de siguranță la pornire: când clientul de auth s-a agățat pe un
 * token stricat, arată o ieșire în loc de „Se încarcă…" la nesfârșit.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const { authStalled } = useAuth()

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
          Sesiunea nu a putut fi verificată
        </h1>
        <p className="mb-6 text-sm text-quasar-gray">
          Conexiunea cu serverul a rămas blocată. Reconectează-te — datele tale
          nu sunt afectate.
        </p>
        <button
          type="button"
          onClick={resetAuthSession}
          className="w-full rounded-md bg-quasar-yellow py-2 font-semibold text-quasar-black transition-colors hover:bg-quasar-yellow-dark"
        >
          Reconectează-te
        </button>
      </div>
    </div>
  )
}
