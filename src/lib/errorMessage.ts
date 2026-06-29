// Traduce erorile Supabase/Postgres în mesaje lizibile pentru utilizator.
// Necesar fiindcă PostgrestError/AuthError/FunctionsError NU sunt instanțe `Error`,
// deci `e instanceof Error ? e.message : fallback` cădea mereu pe fallback-ul generic
// și ascundea cauza reală (ex: RLS denied = lipsă permisiune).

const PERMISSION_DENIED =
  'Nu aveți permisiunea necesară pentru această acțiune. Contactați un administrator sau manager.'

// Coduri Postgres frecvente → mesaj în română. P0001 (raise_exception din RPC)
// e tratat separat: mesajul lui e deja text custom, îl lăsăm să treacă.
const CODE_MESSAGES: Record<string, string> = {
  '42501': PERMISSION_DENIED, // insufficient_privilege / RLS denied
  '23505': 'Există deja o înregistrare cu aceste date.', // unique_violation
  '23503': 'Operația nu se poate face: există date asociate.', // foreign_key_violation
  '23502': 'Lipsește un câmp obligatoriu.', // not_null_violation
  '23514': 'O valoare nu respectă regulile (verificare eșuată).', // check_violation
}

function extract(e: unknown): { code?: string; message?: string } {
  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown }
    return {
      code: typeof o.code === 'string' ? o.code : undefined,
      message: typeof o.message === 'string' ? o.message : undefined,
    }
  }
  return {}
}

export function humanizeError(e: unknown, fallback = 'A apărut o eroare.'): string {
  const { code, message } = extract(e)

  if (code && code in CODE_MESSAGES) return CODE_MESSAGES[code]

  // Mesajele RLS pot ajunge fără cod (ex. din edge functions) — detectăm după text.
  if (message && /row-level security|row level security/i.test(message)) {
    return PERMISSION_DENIED
  }

  if (message) return message
  if (e instanceof Error && e.message) return e.message
  return fallback
}
