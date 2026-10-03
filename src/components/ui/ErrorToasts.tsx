import { useSyncExternalStore } from 'react'
import {
  dismissErrorToast,
  getErrorToasts,
  subscribeErrorToasts,
} from '@/lib/errorToasts'

// Deasupra modalelor (z-50): eroarea vine de obicei dintr-un buton din fereastră.
export function ErrorToasts() {
  const toasts = useSyncExternalStore(subscribeErrorToasts, getErrorToasts)
  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 max-md:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
        >
          <p className="flex-1 text-sm text-red-800">
            <strong className="font-semibold">Nu s-a salvat.</strong> {t.message}
          </p>
          <button
            type="button"
            onClick={() => dismissErrorToast(t.id)}
            className="text-red-700 hover:text-red-900"
            aria-label="Închide mesajul"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
