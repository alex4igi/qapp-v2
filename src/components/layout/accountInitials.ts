/** Inițialele afișate în avatarul contului (rail desktop + meniu mobil). */
export function initialsFromEmail(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}
