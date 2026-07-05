import { supabase } from '@/lib/supabase'
import type { StatusLead, GrupaLead, InteresLead, InsertDto } from '@/types/db'

// Telefoanele (E.164) deja existente dintr-o listă candidată — pentru dedup la
// import în masă. Interogăm DOAR telefoanele din fișier (chunked .in()), nu toate
// leadurile: evită capul PostgREST de 1000 rânduri și URL-uri prea lungi.
export async function findExistingLeadPhones(
  phones: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  const unique = [...new Set(phones.filter(Boolean))]
  const CHUNK = 300
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('leads')
      .select('telefon')
      .in('telefon', batch)
    if (error) throw error
    for (const r of data ?? []) if (r.telefon) found.add(r.telefon)
  }
  return found
}

export type BulkImportRow = {
  nume: string
  prenume: string | null
  nume_parinte: string | null
  telefon: string | null
  email: string | null
  interes: InteresLead | null
  grupa_varsta: GrupaLead | null
  observatii: string | null
}

// Import în masă de leaduri din CSV. Inserează direct (status 'nou'), FĂRĂ a declanșa
// SMS de bun-venit — o listă veche n-ar trebui să trimită sute de SMS-uri. Apelantul
// trimite deja doar rândurile selectate (ne-duplicate, valide).
export async function bulkImportLeads(
  rows: BulkImportRow[],
  opts: { sursa: string | null; locatia: string | null },
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payload: InsertDto<'leads'>[] = rows.map((r) => ({
    nume: r.nume.trim(),
    prenume: r.prenume?.trim() || null,
    nume_parinte: r.nume_parinte?.trim() || null,
    telefon: r.telefon || null,
    email: r.email?.trim() || null,
    interes: r.interes,
    grupa_varsta: r.grupa_varsta,
    observatii: r.observatii?.trim() || null,
    sursa: opts.sursa || null,
    locatia: opts.locatia?.trim() || null,
    status: 'nou' as StatusLead,
    responsabil_id: user?.id ?? null,
  }))

  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < payload.length; i += CHUNK) {
    const batch = payload.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('leads')
      .insert(batch, { count: 'exact' })
    if (error) throw error
    inserted += count ?? batch.length
  }
  return { inserted }
}
