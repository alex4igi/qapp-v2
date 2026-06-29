import { supabase } from '@/lib/supabase'
import type { Datorie, Enums, Incasare, InsertDto, VDatoriiRest } from '@/types/db'

// Creează o datorie one-off (Bilet/Merch/Taxă) — charge-ul din care rezultă restanța
// (rest = suma_datorata − sum(incasari.suma where datorie = id)).
export async function createDatorie(
  dto: InsertDto<'datorii'>,
): Promise<Datorie> {
  const { data, error } = await supabase
    .from('datorii')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Datoriile one-off neachitate ale unui client (rest > 0), vechi → nou.
export async function listDatoriiClient(
  clientId: string,
): Promise<VDatoriiRest[]> {
  const { data, error } = await supabase
    .from('datorii_rest')
    .select('*')
    .eq('client', clientId)
    .gt('rest', 0)
    .order('created', { ascending: true })
  if (error) throw error
  return data ?? []
}

type Tender = { metoda: Enums<'metoda_plata'>; suma: number }
const round2 = (n: number) => Math.round(n * 100) / 100

// Plătește FIFO peste datoriile selectate (vechi → nou), distribuind pool-ul pe
// metode (Cash/Card). Fiecare încasare păstrează categoria datoriei (Bilet/Merch/Taxa)
// și e legată prin `datorie` (ca `inregistrare` pentru înrolări).
export async function registerPlataDatoriiFifo(params: {
  clientId: string
  datorii: {
    id: string
    rest: number
    categorie: Enums<'categorie_incasare'>
    locatie: string | null
  }[]
  partialAmount: number | null
  tenders: Tender[]
  data: string
  locatieId: string
}): Promise<Incasare[]> {
  const portions: {
    datorie: string
    categorie: Enums<'categorie_incasare'>
    locatie: string
    suma: number
  }[] = []
  let pool =
    params.partialAmount != null
      ? params.partialAmount
      : params.datorii.reduce((a, d) => a + d.rest, 0)

  for (const d of params.datorii) {
    if (d.rest <= 0) continue
    const pay = Math.min(d.rest, pool)
    if (pay <= 0) break
    portions.push({
      datorie: d.id,
      categorie: d.categorie,
      locatie: d.locatie ?? params.locatieId,
      suma: round2(pay),
    })
    pool -= pay
    if (pool <= 0) break
  }
  if (portions.length === 0) return []

  const tenders: Tender[] =
    params.tenders.length > 0
      ? params.tenders
      : [{ metoda: 'Cash', suma: portions.reduce((a, p) => a + p.suma, 0) }]

  const mk = (
    datorie: string,
    categorie: Enums<'categorie_incasare'>,
    locatie: string,
    suma: number,
    metoda: Enums<'metoda_plata'>,
  ): InsertDto<'incasari'> => ({
    client: params.clientId,
    datorie,
    data: params.data,
    suma: round2(suma),
    metoda,
    categorie,
    locatie,
  })

  const inserts: InsertDto<'incasari'>[] = []
  let ti = 0
  let tRem = tenders[0].suma
  for (const p of portions) {
    let need = p.suma
    while (need > 0.004) {
      if (tRem <= 0.004) {
        if (ti < tenders.length - 1) {
          ti++
          tRem = tenders[ti].suma
          continue
        }
        inserts.push(mk(p.datorie, p.categorie, p.locatie, need, tenders[ti].metoda))
        need = 0
        break
      }
      const take = Math.min(need, tRem)
      inserts.push(mk(p.datorie, p.categorie, p.locatie, take, tenders[ti].metoda))
      need = round2(need - take)
      tRem = round2(tRem - take)
    }
  }

  const { data, error } = await supabase
    .from('incasari')
    .insert(inserts)
    .select('*')
  if (error) throw error
  return data ?? []
}
