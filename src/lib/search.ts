// Căutare multi-cuvânt: fiecare cuvânt trebuie să apară în cel puțin un câmp
// (AND între cuvinte, OR între câmpuri). Altfel „Ion Popescu” nu prinde un rând
// cu nume=Popescu, prenume=Ion — niciun câmp nu conține string-ul întreg.

// Caractere rezervate în sintaxa de filtru PostgREST — le scoatem din cuvinte
// ca să nu spargem expresia `.or(...)`.
const sanitizeWord = (w: string) => w.replace(/[,()]/g, '')

export function searchWords(search: string): string[] {
  return search.trim().split(/\s+/).map(sanitizeWord).filter(Boolean)
}

// Server-side: aplică pe un query Supabase un `.or(ilike)` per cuvant.
export function applyWordSearch<Q extends { or(filter: string): Q }>(
  query: Q,
  search: string,
  fields: readonly string[],
): Q {
  let q = query
  for (const word of searchWords(search)) {
    q = q.or(fields.map((f) => `${f}.ilike.%${word}%`).join(','))
  }
  return q
}

// Client-side: fiecare cuvânt din căutare trebuie să apară în haystack.
export function matchesWords(haystack: string, search: string): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const h = haystack.toLowerCase()
  return words.every((w) => h.includes(w))
}
