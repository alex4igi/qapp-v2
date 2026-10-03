// Plasa globală pentru erorile de salvare: MutationCache.onError (main.tsx) pune aici
// mesajul oricărei mutații care nu-și afișează singură eroarea, ca un refuz să nu
// arate ca un buton care „nu face nimic".

export type ErrorToast = { id: number; message: string }

declare module '@tanstack/react-query' {
  interface Register {
    // true = mutația afișează singură eroarea (în fereastră, sub buton); plasa o sare.
    mutationMeta: { erroareAfisata?: boolean }
  }
}

const VIZIBIL_MS = 10_000

let toasts: ErrorToast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeErrorToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getErrorToasts(): ErrorToast[] {
  return toasts
}

export function dismissErrorToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function showErrorToast(message: string) {
  // Dublu-clicul produce aceeași eroare de două ori; o arătăm o singură dată.
  if (toasts.some((t) => t.message === message)) return
  const id = nextId++
  toasts = [...toasts, { id, message }].slice(-3)
  emit()
  setTimeout(() => dismissErrorToast(id), VIZIBIL_MS)
}
