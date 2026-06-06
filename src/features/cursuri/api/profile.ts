// Query-uri pentru tab-urile profilului unui curs: clienți activi, inactivi,
// datorii, fără prezență, ocupare (vs capacitate).
import { supabase } from '@/lib/supabase'

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

// Înrolările active la cursul X care acoperă luna curentă, cu clientul atașat.
// „Activă în luna curentă" = activ AND nereziliată AND (data_incepere <= sfârșit lună)
// AND (data_final IS NULL OR data_final >= început lună).
type ActiveEnrollmentRow = {
  id: string
  suma: number | null
  data_incepere: string | null
  data_final: string | null
  client: { id: string; nume: string; prenume: string | null } | null
}

async function fetchActiveEnrollmentsThisMonth(
  cursId: string,
): Promise<ActiveEnrollmentRow[]> {
  const { start, end } = monthBounds(todayIso())
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      'id, suma, data_incepere, data_final, client:clienti(id, nume, prenume)',
    )
    .eq('cursul', cursId)
    .eq('activ', true)
    .eq('reziliat', false)
    .lte('data_incepere', end)
    .or(`data_final.is.null,data_final.gte.${start}`)
  if (error) throw error
  return (data ?? []) as unknown as ActiveEnrollmentRow[]
}

// ============================================================
// Ocupare
// ============================================================

export type CursOcupare = {
  activi: number
  capacitate: number | null
  facultativ: boolean
  // Doar facultativ: media prezenților/ședință în luna curentă (informativă).
  media: number | null
}

export async function getCursOcupare(cursId: string): Promise<CursOcupare> {
  const [enrRows, cursRow] = await Promise.all([
    fetchActiveEnrollmentsThisMonth(cursId),
    supabase
      .from('cursuri')
      .select('capacitate_maxima, facultativ')
      .eq('id', cursId)
      .single(),
  ])
  if (cursRow.error) throw cursRow.error
  const capacitate = cursRow.data.capacitate_maxima
  const facultativ = cursRow.data.facultativ ?? false

  // Recurent: roster distinct activ în luna curentă (oamenii din sală).
  if (!facultativ) {
    const unici = new Set<string>()
    for (const e of enrRows) if (e.client) unici.add(e.client.id)
    return { activi: unici.size, capacitate, facultativ, media: null }
  }

  // Facultativ: capacitate_maxima e o limită PER ȘEDINȚĂ. Ocuparea = vârful ședinței
  // (cei mai mulți prezenți distincți într-o ședință din luna curentă), nu suma unicilor.
  if (enrRows.length === 0) {
    return { activi: 0, capacitate, facultativ, media: null }
  }
  const { start, end } = monthBounds(todayIso())
  const enrIds = enrRows.map((e) => e.id)
  const { data: prez, error: pErr } = await supabase
    .from('prezente')
    .select('client, data')
    .in('enrollment', enrIds)
    .eq('status', 'Prezent')
    .gte('data', start)
    .lte('data', end)
  if (pErr) throw pErr

  // Per dată: clienți distincți prezenți.
  const byData = new Map<string, Set<string>>()
  for (const p of prez ?? []) {
    if (!p.data || !p.client) continue
    let set = byData.get(p.data)
    if (!set) {
      set = new Set<string>()
      byData.set(p.data, set)
    }
    set.add(p.client)
  }
  const counts = Array.from(byData.values()).map((s) => s.size)
  if (counts.length === 0) {
    return { activi: 0, capacitate, facultativ, media: null }
  }
  const peak = Math.max(...counts)
  const media = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
  return { activi: peak, capacitate, facultativ, media }
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
}

export async function getCursClientiActivi(
  cursId: string,
): Promise<CursClientActiv[]> {
  const enrRows = await fetchActiveEnrollmentsThisMonth(cursId)
  if (enrRows.length === 0) return []
  const enrIds = enrRows.map((e) => e.id)

  const { data: prez, error: pErr } = await supabase
    .from('prezente')
    .select('enrollment, data')
    .in('enrollment', enrIds)
    .eq('status', 'Prezent')
    .order('data', { ascending: false })
  if (pErr) throw pErr

  // Mapăm enrollmentId → ultima dată cu Prezent
  const lastByEnr = new Map<string, string>()
  for (const p of prez ?? []) {
    if (p.enrollment && p.data && !lastByEnr.has(p.enrollment)) {
      lastByEnr.set(p.enrollment, p.data)
    }
  }

  // Deduplicăm pe client: păstrăm ultima prezență max + max(suma) între enrolări
  const byClient = new Map<string, CursClientActiv>()
  for (const e of enrRows) {
    if (!e.client) continue
    const last = lastByEnr.get(e.id) ?? null
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

  return Array.from(byClient.values()).sort((a, b) =>
    `${a.nume} ${a.prenume ?? ''}`.localeCompare(`${b.nume} ${b.prenume ?? ''}`),
  )
}

// ============================================================
// Clienți inactivi (au fost cândva, nu mai sunt acum)
// ============================================================

export type CursClientInactiv = {
  clientId: string
  nume: string
  prenume: string | null
  ultimaPrezenta: string | null
}

export async function getCursClientiInactivi(
  cursId: string,
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

  // 2) clienții activi acum (excluzi)
  const activeRows = await fetchActiveEnrollmentsThisMonth(cursId)
  const activeClientIds = new Set<string>()
  for (const e of activeRows) if (e.client) activeClientIds.add(e.client.id)

  // 3) ultima prezență per enrollment
  const enrIds = allEnrRows.map((e) => e.id)
  const { data: prez, error: pErr } = await supabase
    .from('prezente')
    .select('enrollment, data')
    .in('enrollment', enrIds)
    .eq('status', 'Prezent')
    .order('data', { ascending: false })
  if (pErr) throw pErr
  const lastByEnr = new Map<string, string>()
  for (const p of prez ?? []) {
    if (p.enrollment && p.data && !lastByEnr.has(p.enrollment)) {
      lastByEnr.set(p.enrollment, p.data)
    }
  }

  // 4) păstrăm doar clienții cu cel puțin o prezență istorică (au fost cu adevărat la curs)
  //    și care NU mai sunt activi acum
  const byClient = new Map<string, CursClientInactiv>()
  for (const e of allEnrRows) {
    if (!e.client) continue
    if (activeClientIds.has(e.client.id)) continue
    const last = lastByEnr.get(e.id)
    if (!last) continue
    const existing = byClient.get(e.client.id)
    if (!existing || last > (existing.ultimaPrezenta ?? '')) {
      byClient.set(e.client.id, {
        clientId: e.client.id,
        nume: e.client.nume,
        prenume: e.client.prenume,
        ultimaPrezenta: last,
      })
    }
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

// ============================================================
// Clienți activi fără prezență recentă
// ============================================================

export type CursFaraPrezentaRow = {
  clientId: string
  nume: string
  prenume: string | null
  ultimaPrezenta: string | null
}

export async function getCursFaraPrezenteRecente(params: {
  cursId: string
  days?: number
}): Promise<CursFaraPrezentaRow[]> {
  const days = params.days ?? 21
  const cutoff = isoDaysAgo(days)
  const enrRows = await fetchActiveEnrollmentsThisMonth(params.cursId)
  if (enrRows.length === 0) return []
  const enrIds = enrRows.map((e) => e.id)

  // Toate prezențele „Prezent" istorice → ne trebuie ultima per enrollment
  const { data: prez, error: pErr } = await supabase
    .from('prezente')
    .select('enrollment, data')
    .in('enrollment', enrIds)
    .eq('status', 'Prezent')
    .order('data', { ascending: false })
  if (pErr) throw pErr
  const lastByEnr = new Map<string, string>()
  for (const p of prez ?? []) {
    if (p.enrollment && p.data && !lastByEnr.has(p.enrollment)) {
      lastByEnr.set(p.enrollment, p.data)
    }
  }

  // Per client: ia max(ultima prezență) între enrolările lui
  const lastByClient = new Map<string, { nume: string; prenume: string | null; last: string | null }>()
  for (const e of enrRows) {
    if (!e.client) continue
    const last = lastByEnr.get(e.id) ?? null
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
      })
    }
  }

  // Sortare crescătoare după ultima prezență: cei fără prezență (null) primii,
  // apoi de la cel mai vechi la cel mai recent.
  return out.sort((a, b) => {
    if (a.ultimaPrezenta === b.ultimaPrezenta) return 0
    if (a.ultimaPrezenta == null) return -1
    if (b.ultimaPrezenta == null) return 1
    return a.ultimaPrezenta.localeCompare(b.ultimaPrezenta)
  })
}
