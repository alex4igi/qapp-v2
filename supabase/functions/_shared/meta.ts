// Helpers partajați pentru Meta Lead Ads — folosiți de pollerul `pull-meta-leads`
// și de webhook-ul `intake-meta-lead`. Parsarea e aliniată la numele REALE ale
// câmpurilor din formularele Quasar (au diacritice + underscore): `full name`,
// `nume_participant`, `vârstă_participant`, `ce_locație_preferi?`, `date of birth`.
import { mapInteres, mapLocatie } from './intake.ts'

export const GRAPH = 'https://graph.facebook.com/v21.0'

export type FieldDatum = { name: string; values: string[] }

const GRUPA_VALUES = new Set([
  'Tiny', 'Junior', 'Varsity', 'Teens', 'Students', 'Adults',
])

// Numele câmpului: lowercase + fără diacritice + underscore/`?` → spațiu, ca să
// prindem 'varsta'/'locatie' indiferent de cum scrie formularul întrebarea.
function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Meta trimite „date of birth" în format US MM/DD/YYYY (uneori deja ISO).
// → ISO YYYY-MM-DD, sau null dacă nu se poate interpreta cu încredere.
function normDob(v: string): string | null {
  const s = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

export type ParsedLead = {
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  interes: string | null
  locatia: string | null
  grupa_varsta: string | null
  data_nasterii: string | null
  notes: string[]
}

// Extrage din field_data shape-ul de lead. Convenția formularelor Quasar:
//   `full name`        = cel care completează (de regulă părintele) → nume
//   `nume_participant` = copilul                                     → prenume
export function parseLeadFields(fields: FieldDatum[]): ParsedLead {
  let fullName: string | null = null
  let participant: string | null = null
  let firstName: string | null = null
  let lastName: string | null = null
  let email: string | null = null
  let phone: string | null = null
  let interes: string | null = null
  let locatia: string | null = null
  let grupa: string | null = null
  let dob: string | null = null
  const notes: string[] = []

  for (const f of fields) {
    const name = foldName(f.name)
    const value = (f.values?.[0] ?? '').trim()
    if (!value) continue
    const clean = value.replace(/_/g, ' ')

    if (name === 'full name' || name === 'name' || name === 'nume') {
      fullName = value
    } else if (name.includes('participant')) {
      participant = value
    } else if (name === 'first name' || name === 'prenume') {
      firstName = value
    } else if (name === 'last name') {
      lastName = value
    } else if (name.includes('email') || value.includes('@')) {
      if (!email) email = value
    } else if (name.includes('phone') || name.includes('telefon')) {
      if (!phone) phone = value
    } else if (name.includes('locat')) {
      const m = mapLocatie(clean)
      if (m) locatia = m
      else notes.push(`Locație: ${clean}`)
    } else if (name.includes('interes') || name.includes('curs')) {
      const m = mapInteres(clean)
      if (m) interes = m
      else notes.push(`Interes: ${clean}`)
    } else if (name.includes('varsta') || name.includes('grupa')) {
      const match = [...GRUPA_VALUES].find((g) => g.toLowerCase() === value.toLowerCase())
      if (match) grupa = match
      else notes.push(`Vârstă declarată: ${clean}`)
    } else if (name.includes('birth') || name.includes('naster')) {
      dob = normDob(value)
      if (!dob) notes.push(`Data nașterii: ${value}`)
    } else {
      notes.push(`${f.name}: ${value}`)
    }
  }

  return {
    nume: fullName || lastName || participant || 'Lead Meta',
    prenume: participant || firstName,
    telefon: phone,
    email,
    interes,
    locatia,
    grupa_varsta: grupa,
    data_nasterii: dob,
    notes,
  }
}
