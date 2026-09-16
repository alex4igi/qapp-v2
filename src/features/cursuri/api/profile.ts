// Query-uri pentru tab-urile profilului unui curs: clienți activi, inactivi,
// datorii, fără prezență, ocupare (vs capacitate).
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import { fetchVineLaByClient, type VineLa } from '@/lib/ultimaPrezenta'

function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function monthBounds(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  }
}

// Luna de lucru a fișei cursului: "YYYY-MM". Lipsa ei = luna curentă (exact
// comportamentul dinainte de selectorul de lună).
export function lunaCurenta(): string {
  return todayIso().slice(0, 7)
}

function lunaBounds(luna?: string | null): { start: string; end: string } {
  return monthBounds(luna ? `${luna}-01` : todayIso())
}

// Înrolările la cursul X care acoperă luna dată, cu clientul atașat.
// „Acoperă luna" = (data_incepere <= sfârșit lună) AND (data_final IS NULL OR
// data_final >= început lună). NU folosim `activ` — la datele migrate din v1 e
// nesigur (vezi dashboard/api/grupa.ts).
type ActiveEnrollmentRow = {
  id: string
  suma: number | null
  data_incepere: string | null
  data_final: string | null
  client: { id: string; nume: string; prenume: string | null } | null
}

async function fetchEnrollmentsForMonth(
  cursId: string,
  luna?: string | null,
): Promise<ActiveEnrollmentRow[]> {
  const { start, end } = lunaBounds(luna)
  const esteLunaCurenta = start.slice(0, 7) === lunaCurenta()
  let q = supabase
    .from('enrollments')
    .select(
      'id, suma, data_incepere, data_final, client:clienti(id, nume, prenume)',
    )
    .eq('cursul', cursId)
    .lte('data_incepere', end)
    .or(`data_final.is.null,data_final.gte.${start}`)
  // Pe luna curentă `reziliat` e semnalul corect: cine tocmai a plecat e bifat.
  // Pe o lună ÎNCHISĂ nu e — bifa se pune în masă pe lunile încheiate (la
  // închiderea sezonului), deci filtrul ar goli rosterul istoric. Acolo întrebăm
  // `data_reziliere`, singura dată reală a plecării.
  if (esteLunaCurenta) q = q.eq('reziliat', false)
  else q = q.or(`data_reziliere.is.null,data_reziliere.gte.${start}`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as ActiveEnrollmentRow[]
}

// Clienții cu rezervare OPEN ne-anulată pe o ședință din luna curentă (ex.
// ședințele bonus din promo: acces 29-30 iun pe abonamentul de iulie). Înrolarea
// lor nu acoperă luna curentă, deci nu ies din fetchEnrollmentsForMonth,
// dar au totuși acces la curs în această lună → trebuie listați ca activi.
async function fetchOpenReservationClientsThisMonth(
  cursId: string,
  luna?: string | null,
): Promise<ActiveEnrollmentRow[]> {
  const { start, end } = lunaBounds(luna)
  const { data: sesiuni, error: sErr } = await supabase
    .from('open_sesiuni')
    .select('id')
    .eq('curs', cursId)
    .gte('data', start)
    .lte('data', end)
  if (sErr) throw sErr
  const sesiuneIds = (sesiuni ?? []).map((s) => s.id)
  if (sesiuneIds.length === 0) return []

  const { data, error } = await supabase
    .from('open_rezervari')
    .select(
      'enrollment:enrollments(id, suma, data_incepere, data_final, client:clienti(id, nume, prenume))',
    )
    .in('sesiune', sesiuneIds)
    .neq('status', 'anulat')
  if (error) throw error
  const rows: ActiveEnrollmentRow[] = []
  for (const r of (data ?? []) as unknown as Array<{
    enrollment: ActiveEnrollmentRow | null
  }>) {
    if (r.enrollment?.client) rows.push(r.enrollment)
  }
  return rows
}

// Ultima dată „Prezent" per client la un curs. Filtrăm prin JOIN pe `enrollments.cursul`
// (nu `.in(enrollmentIds)`): cursurile facultative au sute de înrolări „Per ședință"
// (data_final null = active la infinit) → un `.in()` cu sute de ID-uri sparge URL-ul.
// `prezente.client` ne dă direct clientul; ordonăm desc și păstrăm prima apariție.
async function fetchUltimaPrezentaByClient(
  cursId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('prezente')
    .select('client, data, enr:enrollments!inner(cursul)')
    .eq('enr.cursul', cursId)
    .eq('status', 'Prezent')
    .order('data', { ascending: false })
  if (error) throw error
  const lastByClient = new Map<string, string>()
  for (const p of (data ?? []) as Array<{ client: string | null; data: string | null }>) {
    if (p.client && p.data && !lastByClient.has(p.client)) {
      lastByClient.set(p.client, p.data)
    }
  }
  return lastByClient
}

// ============================================================
// Ocupare
// ============================================================

export type CursOcupare = {
  activi: number
  capacitate: number | null
}

// Locuri ocupate / capacitate. Luna curentă se citește pe AZI (ședința ține locul
// 30 de zile) — aceeași cifră ca listele din /statistici și Overview. O lună
// încheiată se citește pe toată luna, unde ședința se numără o singură dată, în
// luna ei — aceeași cifră ca pragul minim și bonusurile.
export async function getCursOcupare(
  cursId: string,
  luna?: string | null,
): Promise<CursOcupare> {
  const { start } = lunaBounds(luna)
  const azi = todayIso()
  const peAzi = start.slice(0, 7) === lunaCurenta()
  const [cursRes, locuriRes] = await Promise.all([
    supabase.from('cursuri').select('capacitate_maxima').eq('id', cursId).single(),
    peAzi
      ? supabase.rpc('locuri_ocupate', {
          p_de: azi,
          p_pana: azi,
          p_cursuri: [cursId],
        })
      : supabase.rpc('locuri_ocupate_luna', { p_luna: start, p_cursuri: [cursId] }),
  ])
  if (cursRes.error) throw cursRes.error
  if (locuriRes.error) throw locuriRes.error
  return {
    activi: locuriRes.data?.[0]?.ocupate ?? 0,
    capacitate: cursRes.data.capacitate_maxima,
  }
}

// ============================================================
// Clienți activi
// ============================================================

export type CursClientActiv = {
  clientId: string
  nume: string
  prenume: string | null
  ultimaPrezenta: string | null
  pretInrolare: number | null
  // Reînscriere — calculate pe înrolările viitoare (data_incepere >= luna următoare)
  reinscriereActivata: boolean
  areInrolariViitoare: boolean
  vineLa: VineLa | null
}

export async function getCursClientiActivi(
  cursId: string,
  luna?: string | null,
): Promise<CursClientActiv[]> {
  const [monthEnr, openEnr] = await Promise.all([
    fetchEnrollmentsForMonth(cursId, luna),
    fetchOpenReservationClientsThisMonth(cursId, luna),
  ])
  const enrRows = [...monthEnr, ...openEnr]
  if (enrRows.length === 0) return []

  const lastByClient = await fetchUltimaPrezentaByClient(cursId)

  // Deduplicăm pe client: păstrăm ultima prezență max + max(suma) între enrolări
  const byClient = new Map<string, CursClientActiv>()
  for (const e of enrRows) {
    if (!e.client) continue
    const last = lastByClient.get(e.client.id) ?? null
    const existing = byClient.get(e.client.id)
    if (!existing) {
      byClient.set(e.client.id, {
        clientId: e.client.id,
        nume: e.client.nume,
        prenume: e.client.prenume,
        ultimaPrezenta: last,
        pretInrolare: e.suma,
        reinscriereActivata: false,
        areInrolariViitoare: false,
        vineLa: null,
      })
    } else {
      if (last && (!existing.ultimaPrezenta || last > existing.ultimaPrezenta)) {
        existing.ultimaPrezenta = last
      }
      if (e.suma != null && (existing.pretInrolare == null || e.suma > existing.pretInrolare)) {
        existing.pretInrolare = e.suma
      }
    }
  }

  // Înrolări viitoare (luna următoare+) ale acestor clienți la curs — pentru status reînscriere.
  const today = new Date()
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthStartIso = nextMonthStart.toISOString().slice(0, 10)
  const clientIds = Array.from(byClient.keys())
  if (clientIds.length > 0) {
    const { data: future, error: fErr } = await supabase
      .from('enrollments')
      .select('client, este_reinscriere')
      .eq('cursul', cursId)
      .eq('reziliat', false)
      .in('client', clientIds)
      .gte('data_incepere', nextMonthStartIso)
    if (fErr) throw fErr
    for (const f of future ?? []) {
      if (!f.client) continue
      const c = byClient.get(f.client)
      if (!c) continue
      c.areInrolariViitoare = true
      if (f.este_reinscriere) c.reinscriereActivata = true
    }
  }

  const vineLa = await fetchVineLaByClient({
    clienti: Array.from(byClient, ([id, c]) => ({
      id,
      ultimaPrezenta: c.ultimaPrezenta,
    })),
    exceptCursId: cursId,
  })
  for (const [clientId, v] of vineLa) {
    const row = byClient.get(clientId)
    if (row) row.vineLa = v
  }

  return Array.from(byClient.values()).sort((a, b) =>
    `${a.nume} ${a.prenume ?? ''}`.localeCompare(`${b.nume} ${b.prenume ?? ''}`),
  )
}

// ============================================================
// Clienți fără niciun document atașat la profil (documente_client)
// ============================================================

export type CursClientFaraDoc = {
  clientId: string
  nume: string
  prenume: string | null
}

// Membrii activi ai cursului care NU au niciun rând în `documente_client`.
// Refolosește lista de clienți activi + o singură interogare pe documente.
export async function getCursClientiFaraDocumente(
  cursId: string,
  luna?: string | null,
): Promise<CursClientFaraDoc[]> {
  const activi = await getCursClientiActivi(cursId, luna)
  if (activi.length === 0) return []
  const ids = activi.map((c) => c.clientId)
  const { data, error } = await supabase
    .from('documente_client')
    .select('client')
    .in('client', ids)
  if (error) throw error
  const cuDoc = new Set((data ?? []).map((d) => d.client))
  return activi
    .filter((c) => !cuDoc.has(c.clientId))
    .map((c) => ({ clientId: c.clientId, nume: c.nume, prenume: c.prenume }))
}

// ============================================================
// Clienți inactivi (au fost cândva, nu mai sunt acum)
// ============================================================

export type CursClientInactiv = {
  clientId: string
  nume: string
  prenume: string | null
  ultimaPrezenta: string | null
  vineLa: VineLa | null
}

export async function getCursClientiInactivi(
  cursId: string,
  luna?: string | null,
): Promise<CursClientInactiv[]> {
  // 1) toate enrolările (oricare status) la cursul ăsta + clientul lor
  const { data: allEnr, error: eErr } = await supabase
    .from('enrollments')
    .select('id, client:clienti(id, nume, prenume)')
    .eq('cursul', cursId)
  if (eErr) throw eErr
  const allEnrRows = (allEnr ?? []) as unknown as Array<{
    id: string
    client: { id: string; nume: string; prenume: string | null } | null
  }>
  if (allEnrRows.length === 0) return []

  // 2) clienții activi în luna afișată (excluzi)
  const activeRows = await fetchEnrollmentsForMonth(cursId, luna)
  const activeClientIds = new Set<string>()
  for (const e of activeRows) if (e.client) activeClientIds.add(e.client.id)

  // 3) ultima prezență per client (join pe curs, nu `.in(enrollmentIds)`)
  const lastByClient = await fetchUltimaPrezentaByClient(cursId)

  // 4) păstrăm doar clienții cu cel puțin o prezență istorică (au fost cu adevărat la curs)
  //    și care NU mai sunt activi acum
  const byClient = new Map<string, CursClientInactiv>()
  for (const e of allEnrRows) {
    if (!e.client) continue
    if (activeClientIds.has(e.client.id)) continue
    const last = lastByClient.get(e.client.id)
    if (!last) continue
    const existing = byClient.get(e.client.id)
    if (!existing || last > (existing.ultimaPrezenta ?? '')) {
      byClient.set(e.client.id, {
        clientId: e.client.id,
        nume: e.client.nume,
        prenume: e.client.prenume,
        ultimaPrezenta: last,
        vineLa: null,
      })
    }
  }

  const vineLa = await fetchVineLaByClient({
    clienti: Array.from(byClient, ([id, c]) => ({
      id,
      ultimaPrezenta: c.ultimaPrezenta,
    })),
    exceptCursId: cursId,
  })
  for (const [clientId, v] of vineLa) {
    const row = byClient.get(clientId)
    if (row) row.vineLa = v
  }

  // Sortare descendentă după ultima prezență (cei recent inactivați sus)
  return Array.from(byClient.values()).sort((a, b) =>
    (b.ultimaPrezenta ?? '').localeCompare(a.ultimaPrezenta ?? ''),
  )
}

// ============================================================
// Restanțieri (datorii pe sezon)
// ============================================================

export type CursDatorieRow = {
  clientId: string
  nume: string
  prenume: string | null
  rest: number
}

export async function getCursDatorii(params: {
  cursId: string
  sezonStart: string
  sezonEnd: string
}): Promise<CursDatorieRow[]> {
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select('id_cursant, nume_client, prenume_client, rest')
    .eq('id_curs', params.cursId)
    .eq('prescris', false)
    .eq('viitor', false)
    .gte('data_incepere', params.sezonStart)
    .lte('data_incepere', params.sezonEnd)
  if (error) throw error

  const byClient = new Map<string, CursDatorieRow>()
  for (const r of data ?? []) {
    if (!r.id_cursant) continue
    const rest = Number(r.rest ?? 0)
    if (rest <= 0) continue
    const existing = byClient.get(r.id_cursant)
    if (existing) {
      existing.rest += rest
    } else {
      byClient.set(r.id_cursant, {
        clientId: r.id_cursant,
        nume: r.nume_client ?? '',
        prenume: r.prenume_client,
        rest,
      })
    }
  }

  return Array.from(byClient.values()).sort((a, b) =>
    `${a.nume} ${a.prenume ?? ''}`.localeCompare(`${b.nume} ${b.prenume ?? ''}`),
  )
}

// Aceeași agregare, dar pentru MAI MULTE cursuri într-o singură cerere (KPI
// „Restanțieri azi" de pe dashboard trimitea 14 cereri paralele, una per grupă).
// Paginat: peste 1000 de rânduri PostgREST ar trunchia tăcut totalul.
export async function getCursuriDatorii(params: {
  cursIds: string[]
  sezonStart: string
  sezonEnd: string
}): Promise<Map<string, CursDatorieRow[]>> {
  const out = new Map<string, CursDatorieRow[]>()
  if (params.cursIds.length === 0) return out
  const rows = await fetchAllRows(() =>
    supabase
      .from('plati_inrolari')
      .select('id_curs, id_cursant, nume_client, prenume_client, rest')
      .in('id_curs', params.cursIds)
      .eq('prescris', false)
      .eq('viitor', false)
      .gte('data_incepere', params.sezonStart)
      .lte('data_incepere', params.sezonEnd)
      .order('id_enrollment', { ascending: true }),
  )

  const byCurs = new Map<string, Map<string, CursDatorieRow>>()
  for (const r of rows) {
    if (!r.id_curs || !r.id_cursant) continue
    const rest = Number(r.rest ?? 0)
    if (rest <= 0) continue
    let byClient = byCurs.get(r.id_curs)
    if (!byClient) {
      byClient = new Map<string, CursDatorieRow>()
      byCurs.set(r.id_curs, byClient)
    }
    const existing = byClient.get(r.id_cursant)
    if (existing) {
      existing.rest += rest
    } else {
      byClient.set(r.id_cursant, {
        clientId: r.id_cursant,
        nume: r.nume_client ?? '',
        prenume: r.prenume_client,
        rest,
      })
    }
  }
  for (const [cursId, byClient] of byCurs) {
    out.set(
      cursId,
      Array.from(byClient.values()).sort((a, b) =>
        `${a.nume} ${a.prenume ?? ''}`.localeCompare(`${b.nume} ${b.prenume ?? ''}`),
      ),
    )
  }
  return out
}

// ============================================================
// Clienți activi fără prezență recentă
// ============================================================

export type CursFaraPrezentaRow = {
  clientId: string
  nume: string
  prenume: string | null
  ultimaPrezenta: string | null
  // Rămâne în listă chiar dacă vine altundeva — profesorul grupei ăsteia tot
  // trebuie să știe că l-a pierdut. Vezi lib/ultimaPrezenta.ts.
  vineLa: VineLa | null
}

export async function getCursFaraPrezenteRecente(params: {
  cursId: string
  days?: number
}): Promise<CursFaraPrezentaRow[]> {
  const days = params.days ?? 21
  const cutoff = isoDaysAgo(days)
  const enrRows = await fetchEnrollmentsForMonth(params.cursId)
  if (enrRows.length === 0) return []

  // Ultima prezență per client (join pe curs, nu `.in(enrollmentIds)`)
  const ultimaByClient = await fetchUltimaPrezentaByClient(params.cursId)

  // Per client: ia max(ultima prezență) între enrolările lui
  const lastByClient = new Map<string, { nume: string; prenume: string | null; last: string | null }>()
  for (const e of enrRows) {
    if (!e.client) continue
    const last = ultimaByClient.get(e.client.id) ?? null
    const existing = lastByClient.get(e.client.id)
    if (!existing) {
      lastByClient.set(e.client.id, {
        nume: e.client.nume,
        prenume: e.client.prenume,
        last,
      })
    } else if (last && (!existing.last || last > existing.last)) {
      existing.last = last
    }
  }

  // Păstrăm doar cei cu ultima prezență < cutoff (sau fără prezență deloc)
  const out: CursFaraPrezentaRow[] = []
  for (const [clientId, v] of lastByClient) {
    if (!v.last || v.last < cutoff) {
      out.push({
        clientId,
        nume: v.nume,
        prenume: v.prenume,
        ultimaPrezenta: v.last,
        vineLa: null,
      })
    }
  }

  const vineLa = await fetchVineLaByClient({
    clienti: out.map((r) => ({ id: r.clientId, ultimaPrezenta: r.ultimaPrezenta })),
    exceptCursId: params.cursId,
  })
  for (const r of out) r.vineLa = vineLa.get(r.clientId) ?? null

  // Sortare crescătoare după ultima prezență: cei fără prezență (null) primii,
  // apoi de la cel mai vechi la cel mai recent.
  return out.sort((a, b) => {
    if (a.ultimaPrezenta === b.ultimaPrezenta) return 0
    if (a.ultimaPrezenta == null) return -1
    if (b.ultimaPrezenta == null) return 1
    return a.ultimaPrezenta.localeCompare(b.ultimaPrezenta)
  })
}

// ============================================================
// Lunile grupei (selectorul „Luna" din fișa cursului + pagina grupei)
// ============================================================

export type CursLuna = { luna: string; cursanti: number }

// Un rând de înrolare acoperă un interval, nu doar luna lui de început: plata
// integrală pe sezon are `data_final` peste ~10 luni. Plafonul e o plasă de
// siguranță pentru date murdare (data_final absurd de departe).
const MAX_LUNI_PE_INROLARE = 24

function nextMonth(luna: string): string {
  const [y, m] = luna.split('-').map(Number)
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`
}

function monthsCovered(
  dataIncepere: string,
  dataFinal: string | null,
): string[] {
  const start = dataIncepere.slice(0, 7)
  // Fără `data_final` NU extrapolăm: rândurile „Per ședință" de la facultative au
  // data_final NULL și ar inventa toate lunile de la ședința lor până azi.
  const end = dataFinal ? dataFinal.slice(0, 7) : start
  if (end <= start) return [start]
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < MAX_LUNI_PE_INROLARE) {
    out.push(cur)
    cur = nextMonth(cur)
  }
  return out
}

type IstoricEnrollmentRow = {
  id: string
  data_incepere: string | null
  data_final: string | null
  client: { id: string; nume: string; prenume: string | null } | null
}

async function fetchAllEnrollmentsForCurs(
  cursId: string,
): Promise<IstoricEnrollmentRow[]> {
  return fetchAllRows<IstoricEnrollmentRow>(() =>
    supabase
      .from('enrollments')
      .select('id, data_incepere, data_final, client:clienti(id, nume, prenume)')
      .eq('cursul', cursId)
      .order('id'),
  ) as unknown as Promise<IstoricEnrollmentRow[]>
}

// Lunile în care grupa a avut oameni, cele mai noi întâi. Alimentează selectorul
// de lună — oferă doar luni care chiar întorc un roster, nu un calendar gol.
export async function getCursLuni(cursId: string): Promise<CursLuna[]> {
  const rows = await fetchAllEnrollmentsForCurs(cursId)
  const byLuna = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.client || !r.data_incepere) continue
    for (const luna of monthsCovered(r.data_incepere, r.data_final)) {
      let set = byLuna.get(luna)
      if (!set) {
        set = new Set<string>()
        byLuna.set(luna, set)
      }
      set.add(r.client.id)
    }
  }
  return Array.from(byLuna, ([luna, clienti]) => ({
    luna,
    cursanti: clienti.size,
  })).sort((a, b) => b.luna.localeCompare(a.luna))
}

// ============================================================
// Istoric complet: toți cursanții care au trecut vreodată prin grupă
// ============================================================

export type CursIstoricRow = {
  clientId: string
  nume: string
  prenume: string | null
  // "YYYY-MM" — prima și ultima lună facturată pe ACEASTĂ grupă.
  primaLuna: string | null
  ultimaLuna: string | null
  luniFacturate: number
  prezente: number
  ultimaPrezenta: string | null
  // Are înrolare care acoperă luna curentă la grupa asta.
  activAcum: boolean
  vineLa: VineLa | null
}

// Fără fereastră de lună și fără fereastra de 180 de zile a „foștilor": aici
// intră toți oamenii care au avut vreodată o înrolare pe grupă. E singurul loc
// din app unde o grupă de sezon închis își arată efectiv cursanții.
export async function getCursIstoric(cursId: string): Promise<CursIstoricRow[]> {
  const enrRows = await fetchAllEnrollmentsForCurs(cursId)
  if (enrRows.length === 0) return []

  type Acc = {
    nume: string
    prenume: string | null
    luni: Set<string>
  }
  const byClient = new Map<string, Acc>()
  for (const r of enrRows) {
    if (!r.client || !r.data_incepere) continue
    let acc = byClient.get(r.client.id)
    if (!acc) {
      acc = { nume: r.client.nume, prenume: r.client.prenume, luni: new Set() }
      byClient.set(r.client.id, acc)
    }
    for (const luna of monthsCovered(r.data_incepere, r.data_final)) {
      acc.luni.add(luna)
    }
  }
  if (byClient.size === 0) return []

  // Prezențele grupei, paginate: un curs cu 3 sezoane depășește lejer plafonul
  // tăcut de 1000 de rânduri al PostgREST. JOIN pe curs, nu `.in(enrollmentIds)`
  // (facultativele au sute de înrolări → URL spart).
  const prezRows = await fetchAllRows<{
    id: string
    client: string | null
    data: string | null
    status: string | null
  }>(() =>
    supabase
      .from('prezente')
      .select('id, client, data, status, enr:enrollments!inner(cursul)')
      .eq('enr.cursul', cursId)
      .order('id'),
  )
  const prezenteByClient = new Map<string, number>()
  const ultimaByClient = new Map<string, string>()
  for (const p of prezRows) {
    if (!p.client || p.status !== 'Prezent') continue
    prezenteByClient.set(p.client, (prezenteByClient.get(p.client) ?? 0) + 1)
    if (p.data) {
      const prev = ultimaByClient.get(p.client)
      if (!prev || p.data > prev) ultimaByClient.set(p.client, p.data)
    }
  }

  const activi = await fetchEnrollmentsForMonth(cursId)
  const activiIds = new Set<string>()
  for (const e of activi) if (e.client) activiIds.add(e.client.id)

  const rows: CursIstoricRow[] = Array.from(byClient, ([clientId, acc]) => {
    const luni = Array.from(acc.luni).sort()
    return {
      clientId,
      nume: acc.nume,
      prenume: acc.prenume,
      primaLuna: luni[0] ?? null,
      ultimaLuna: luni[luni.length - 1] ?? null,
      luniFacturate: luni.length,
      prezente: prezenteByClient.get(clientId) ?? 0,
      ultimaPrezenta: ultimaByClient.get(clientId) ?? null,
      activAcum: activiIds.has(clientId),
      vineLa: null,
    }
  })

  // „Unde e acum" are sens doar pentru cine a plecat de la grupa asta.
  const vineLa = await fetchVineLaByClient({
    clienti: rows
      .filter((r) => !r.activAcum)
      .map((r) => ({ id: r.clientId, ultimaPrezenta: r.ultimaPrezenta })),
    exceptCursId: cursId,
  })
  for (const r of rows) r.vineLa = vineLa.get(r.clientId) ?? null

  // Cei mai recent plecați sus — lista se citește de sus în jos la recuperare.
  return rows.sort((a, b) => {
    const cmp = (b.ultimaLuna ?? '').localeCompare(a.ultimaLuna ?? '')
    if (cmp !== 0) return cmp
    return `${a.nume} ${a.prenume ?? ''}`.localeCompare(
      `${b.nume} ${b.prenume ?? ''}`,
    )
  })
}
