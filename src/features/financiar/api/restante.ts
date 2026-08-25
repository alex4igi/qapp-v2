import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import { fetchAllRows } from '@/lib/fetchAll'
import type { Views } from '@/types/db'
import { lunaToBounds } from '@/features/statistici/api/interval'
import { PAGE_SIZE } from './incasari'

export type RestantaRow = Views<'plati_inrolari'>

export type RestanteListParams = {
  search: string
  page: number
  locatieId: string | null
  cursId: string | null
  luna: string | null // 'YYYY-MM' — luna facturată (data_incepere), null = toate lunile
}

export type RestanteListResult = {
  rows: RestantaRow[]
  total: number
  sumRest: number // doar restanțele active (neprescrise) — totalul de recuperat
  sumPrescris: number // restanțe prescrise (> 2 ani), excluse din totalul de recuperat
  countPrescris: number
}

export async function listRestante({
  search,
  page,
  locatieId,
  cursId,
  luna,
}: RestanteListParams): Promise<RestanteListResult> {
  const rangeFrom = page * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  const buildBase = () => {
    // viitor=false: lunile facturate în avans (ex. reînscriere pe sezonul următor)
    // nu sunt restanțe — definiția canonică, aliniată cu /datorii și worklist.
    let q = supabase.from('plati_inrolari').select('*').gt('rest', 0).eq('viitor', false)
    if (locatieId) q = q.eq('id_locatie', locatieId)
    if (cursId) q = q.eq('id_curs', cursId)
    if (luna) {
      const { from, to } = lunaToBounds(luna)
      q = q.gte('data_incepere', from).lte('data_incepere', to)
    }
    q = applyWordSearch(q, search, ['nume_client', 'prenume_client', 'nume_curs'])
    return q
  }

  const paginated = buildBase()
    .order('data_incepere', { ascending: false, nullsFirst: false })
    .range(rangeFrom, rangeTo)

  const { data, error } = await paginated
  if (error) throw error

  // Pentru count + sumă: fetch toate rest-urile (rest + prescris) ca să putem
  // agrega corect; paginat prin fetchAllRows ca să nu ne oprim la max_rows (1000).
  const allRows = await fetchAllRows(() =>
    buildBase().select('rest, prescris, id').order('id', { ascending: true }),
  )
  let sumRest = 0
  let sumPrescris = 0
  let countPrescris = 0
  for (const r of allRows) {
    const val = Number(r.rest ?? 0)
    if (r.prescris) {
      sumPrescris += val
      countPrescris += 1
    } else {
      sumRest += val
    }
  }
  const total = allRows.length

  return { rows: data ?? [], total, sumRest, sumPrescris, countPrescris }
}

// Export: toate restanțele filtrate (fără paginare) pentru CSV cu total real.
export async function exportRestante(
  params: Omit<RestanteListParams, 'page'>,
): Promise<RestantaRow[]> {
  // Paginat: peste max_rows (1000) exportul ar fi tăiat silențios.
  return fetchAllRows(() => {
    let q = supabase.from('plati_inrolari').select('*').gt('rest', 0).eq('viitor', false)
    if (params.locatieId) q = q.eq('id_locatie', params.locatieId)
    if (params.cursId) q = q.eq('id_curs', params.cursId)
    if (params.luna) {
      const { from, to } = lunaToBounds(params.luna)
      q = q.gte('data_incepere', from).lte('data_incepere', to)
    }
    q = applyWordSearch(q, params.search, [
      'nume_client',
      'prenume_client',
      'nume_curs',
    ])
    return q
      .order('data_incepere', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
  })
}
