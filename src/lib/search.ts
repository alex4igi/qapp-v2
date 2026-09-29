import { roMobileNational } from './phone'

// Căutare multi-cuvânt: fiecare cuvânt trebuie să apară în cel puțin un câmp
// (AND între cuvinte, OR între câmpuri). Altfel „Ion Popescu” nu prinde un rând
// cu nume=Popescu, prenume=Ion — niciun câmp nu conține string-ul întreg.

// Caractere rezervate în sintaxa de filtru PostgREST — le scoatem din cuvinte
// ca să nu spargem expresia `.or(...)`.
const sanitizeWord = (w: string) => w.replace(/[,()]/g, '')

// Telefoanele stau în formate amestecate: leadurile au `+40747823419`, fișele
// clienților `0747823419`, `747823419`, `0747 823 419`, `(0747) 823.419`. Un număr
// căutat se reduce la cele 9 cifre naționale, altfel `+40…` copiat de pe un lead
// nu găsește clientul (incident 2026-09-29, lead Meta la o clientă activă).
const PHONE_RUN = /\+?\d[\d\s().-]*\d/g
const NATIONAL = /^7\d{8}$/

function normalizePhones(search: string): string {
  return search.replace(PHONE_RUN, (run) => {
    const nat = roMobileNational(run)
    if (nat) return nat
    // Început de număr („0747 82", „+40747"): prefixul diferă între tabele,
    // deci căutăm fără el. Punctul și cratima rămân ale datelor („07.10").
    if (/[.-]/.test(run)) return run
    const m = run.replace(/[\s()]/g, '').match(/^(?:\+40|0040|0)(7\d{3,})$/)
    return m ? m[1] : run
  })
}

export function searchWords(search: string): string[] {
  return normalizePhones(search).trim().split(/\s+/).map(sanitizeWord).filter(Boolean)
}

// Numărul complet se caută pe grupe de câte 3 cifre, ca să prindă și formele
// cu separatori (`0747 823 419`, `+40 747 823 419`, `0747.823.419`).
const wordPattern = (word: string) =>
  NATIONAL.test(word)
    ? `%${word.slice(0, 3)}%${word.slice(3, 6)}%${word.slice(6)}%`
    : `%${word}%`

// Server-side: aplică pe un query Supabase un `.or(ilike)` per cuvant.
export function applyWordSearch<Q extends { or(filter: string): Q }>(
  query: Q,
  search: string,
  fields: readonly string[],
): Q {
  let q = query
  for (const word of searchWords(search)) {
    const pattern = wordPattern(word)
    q = q.or(fields.map((f) => `${f}.ilike.${pattern}`).join(','))
  }
  return q
}

// Client-side: fiecare cuvânt din căutare trebuie să apară în haystack.
export function matchesWords(haystack: string, search: string): boolean {
  const words = searchWords(search.toLowerCase())
  if (words.length === 0) return true
  const h = haystack.toLowerCase()
  // Separatorii dintre cifre dispar, ca `0747 823 419` din haystack să conțină `747823419`.
  const hDigits = h.replace(/(\d)[\s().-]+(?=\d)/g, '$1')
  return words.every((w) => h.includes(w) || hDigits.includes(w))
}
