// Dashboard pentru o grupă (curs) — roster cu status azi (prezent/absent/
// inactiv/programat) pentru cursanți + leads programați la acest curs azi.
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { endOfMonth } from '@/features/plati/api/calendar'
import { isoDaysAgo } from './helpers'

export type RosterStatus = 'prezent' | 'absent' | 'inactiv' | 'programat'

export type RosterKind = 'client' | 'lead'

export type GrupaRosterRow = {
  // ID-ul folosit ca key React. Pentru clienți = enrollmentId, pentru leads = leadId.
  rowId: string
  kind: RosterKind
  // Pentru clienți → enrollment activ (cel mai relevant). Pentru leads → null.
  enrollmentId: string | null
  // Pentru clienți = clienti.id, pentru leads = leads.id (folosit la navigare).
  refId: string
  nume: string
  prenume: string | null
  poza: string | null
  // Telefon de contact (părinte/cursant). Doar pentru clienți; leads = null.
  telefon: string | null
  status: RosterStatus
  restanta: number
  esteZiua: boolean
}

export type GrupaDashboard = {
  cursId: string
  cursNume: string
  ora: string | null
  teacher: string | null
  sala: string | null
  facultativ: boolean
  roster: GrupaRosterRow[]
  counters: {
    prezenti: number
    absenti: number
    inactivi: number
    programati: number
  }
}

// Definiție business (2026-05-19): cursantul devine „inactiv" pe o grupă dacă
// NU are nicio prezență `Prezent` în ultimele 21 zile la enrollment-ul lui pe
// acea grupă. „Activ" = există minim o prezență Prezent în acest interval.
const INACTIV_DAYS = 21

export async function getGrupaDashboard(params: {
  cursId: string
  date: string
}): Promise<GrupaDashboard> {
  const { data: curs, error: cursErr } = await supabase
    .from('cursuri')
    .select(
      'id, numele, ora, facultativ, sala:sali(nume), teacher:teacheri!fk_cursuri_teacher(nume, prenume)',
    )
    .eq('id', params.cursId)
    .single()
  if (cursErr) throw cursErr
  const cursRow = curs as unknown as {
    id: string
    numele: string
    ora: string | null
    facultativ: boolean
    sala: { nume: string } | null
    teacher: { nume: string; prenume: string | null } | null
  }

  // Apartenența la grupă = înrolare NEreziliată care ACOPERĂ luna afișată.
  // Înlocuiește vechiul filtru `activ=true` simplu, care avea două defecte:
  //  1. rândurile lunilor trecute rămân `activ=true` pe veci → cursanții plecați
  //     (sau mutați la altă grupă) rămâneau fantome permanente în roster;
  //  2. arăta și rânduri `reziliat=true` dacă aveau `activ=true`.
  // NU folosim `activ` ca semnal: la datele migrate din v1 e nesigur (rândul activ
  // poate fi o lună veche reziliată, iar lunile reale curente sunt `activ=false`).
  // Semnalele de încredere sunt `reziliat=false` + acoperirea lunii (data_final =
  // sfârșitul lunii pentru recurent lunar → auto-curățitor).
  const monthStart = params.date.slice(0, 7) + '-01'
  const monthEnd = endOfMonth(monthStart)
  const { data: enrData, error: enrErr } = await supabase
    .from('enrollments')
    .select(
      'id, suma, tip_plata, data_incepere, client:clienti(id, nume, prenume, foto, data_nasterii, telefon)',
    )
    .eq('cursul', params.cursId)
    .eq('reziliat', false)
    .lte('data_incepere', monthEnd)
    .or(`data_final.is.null,data_final.gte.${monthStart}`)
  if (enrErr) throw enrErr
  const enrollments = (enrData ?? []) as unknown as Array<{
    id: string
    suma: number | null
    tip_plata: Enums<'tip_plata'> | null
    data_incepere: string | null
    client: {
      id: string
      nume: string
      prenume: string | null
      foto: string | null
      data_nasterii: string | null
      telefon: string | null
    } | null
  }>
  const enrollmentIds = enrollments.map((e) => e.id)
  const todayMmDd = params.date.slice(5) // "MM-DD"

  // Cursuri facultative: clienții cu rezervare OPEN ne-anulată pe această zi au
  // acces și trebuie să apară în roster (ex. ședințele bonus din promo), chiar
  // dacă înrolarea lor nu acoperă luna afișată. Oglindește getOpenRosterForDate
  // din prezente/api.ts, ca să fie consistent cardul recepției cu pagina de prezențe.
  type OpenEntry = {
    enrollmentId: string
    client: {
      id: string
      nume: string
      prenume: string | null
      foto: string | null
      data_nasterii: string | null
      telefon: string | null
    }
  }
  const openEntries: OpenEntry[] = []
  if (cursRow.facultativ) {
    const { data: sesiune, error: sErr } = await supabase
      .from('open_sesiuni')
      .select('id')
      .eq('curs', params.cursId)
      .eq('data', params.date)
      .maybeSingle()
    if (sErr) throw sErr
    if (sesiune) {
      const { data: rez, error: rezErr } = await supabase
        .from('open_rezervari')
        .select(
          'enrollment, client:clienti(id, nume, prenume, foto, data_nasterii, telefon)',
        )
        .eq('sesiune', sesiune.id)
        .neq('status', 'anulat')
      if (rezErr) throw rezErr
      for (const r of (rez ?? []) as unknown as Array<{
        enrollment: string | null
        client: OpenEntry['client'] | null
      }>) {
        if (r.enrollment && r.client) {
          openEntries.push({ enrollmentId: r.enrollment, client: r.client })
        }
      }
    }
  }
  // Status-ul de azi se citește și pentru înrolările rezervărilor OPEN.
  const statusEnrollmentIds = [
    ...enrollmentIds,
    ...openEntries.map((o) => o.enrollmentId),
  ]

  const baseHeader = {
    cursId: cursRow.id,
    cursNume: cursRow.numele,
    ora: cursRow.ora,
    sala: cursRow.sala?.nume ?? null,
    facultativ: Boolean(cursRow.facultativ),
    teacher: cursRow.teacher
      ? `${cursRow.teacher.nume} ${cursRow.teacher.prenume ?? ''}`.trim()
      : null,
  }

  const { data: prezToday, error: pErr } = statusEnrollmentIds.length
    ? await supabase
        .from('prezente')
        .select('enrollment, status')
        .in('enrollment', statusEnrollmentIds)
        .eq('data', params.date)
    : { data: [], error: null }
  if (pErr) throw pErr
  const statusToday = new Map<string, Enums<'status_prezenta'>>()
  for (const p of prezToday ?? []) {
    if (p.enrollment && p.status) statusToday.set(p.enrollment, p.status)
  }

  const cutoff = isoDaysAgo(INACTIV_DAYS)
  const { data: recent, error: rErr } = enrollmentIds.length
    ? await supabase
        .from('prezente')
        .select('enrollment, data')
        .in('enrollment', enrollmentIds)
        .gte('data', cutoff)
        .eq('status', 'Prezent')
    : { data: [], error: null }
  if (rErr) throw rErr
  const hasRecent = new Set<string>()
  for (const r of recent ?? []) {
    if (r.enrollment) hasRecent.add(r.enrollment)
  }

  // Plăți cumulative per înrolare → restanță = max(0, suma - sum(plăți))
  const { data: incasariRows, error: iErr } = enrollmentIds.length
    ? await supabase
        .from('incasari')
        .select('inregistrare, suma')
        .in('inregistrare', enrollmentIds)
    : { data: [], error: null }
  if (iErr) throw iErr
  const paidByEnr = new Map<string, number>()
  for (const r of incasariRows ?? []) {
    if (!r.inregistrare) continue
    paidByEnr.set(
      r.inregistrare,
      (paidByEnr.get(r.inregistrare) ?? 0) + Number(r.suma ?? 0),
    )
  }
  const restantaByEnr = new Map<string, number>()
  for (const e of enrollments) {
    const due = Number(e.suma ?? 0)
    const paid = paidByEnr.get(e.id) ?? 0
    restantaByEnr.set(e.id, Math.max(0, due - paid))
  }

  // Deduplicăm per client: un cursant cu 4 înrolări lunare la același curs e
  // un singur card. Agreg statusul peste toate înrolările lui.
  const STATUS_RANK: Record<RosterStatus, number> = {
    prezent: 0,
    absent: 1,
    programat: 2,
    inactiv: 3,
  }

  // Restanță agregată per client (sumează peste toate înrolările active)
  const restantaByClient = new Map<string, number>()
  for (const e of enrollments) {
    if (!e.client) continue
    const r = restantaByEnr.get(e.id) ?? 0
    restantaByClient.set(
      e.client.id,
      (restantaByClient.get(e.client.id) ?? 0) + r,
    )
  }

  const byClient = new Map<string, GrupaRosterRow>()
  for (const e of enrollments) {
    if (!e.client) continue
    // Facultativ „Per ședință": înrolarea acoperă O SINGURĂ ședință (data_incepere),
    // nu toată luna. O includem doar pe ziua ei și o tratăm absent/prezent — niciodată
    // `inactiv`. Altfel un rând cu `data_final=NULL` ar deveni fantomă inactivă în
    // fiecare zi/lună ≥ data_incepere. Prezența reală vine via rezervarea OPEN a zilei.
    const isPerSedintaFacultativ =
      cursRow.facultativ && e.tip_plata === 'Per sedinta'
    if (isPerSedintaFacultativ && e.data_incepere !== params.date) continue

    const s = statusToday.get(e.id)
    // O înrolare abia începută (data_incepere în fereastra de 21 zile) NU e
    // „inactiv": cursantul tocmai a fost înrolat pe grupa asta (ex. trecerea în
    // sezonul nou/vară) și n-a avut încă ocazia să vină. Altfel cardul lui apare
    // inactiv și — pe facultativ — oferă „Înrolare nouă" deși e deja înrolat.
    const inrolareRecenta = Boolean(e.data_incepere && e.data_incepere >= cutoff)
    let status: RosterStatus
    if (s === 'Prezent') status = 'prezent'
    else if (s === 'Absent' || s === 'Motivat') status = 'absent'
    else if (isPerSedintaFacultativ) status = 'absent'
    else if (!hasRecent.has(e.id) && !inrolareRecenta) status = 'inactiv'
    // Cursantii nebifati azi sunt implicit absenti (pana cineva ii marcheaza
    // prezent). Statusul `programat` (galben) e rezervat doar leads-urilor.
    else status = 'absent'

    const existing = byClient.get(e.client.id)
    if (!existing || STATUS_RANK[status] < STATUS_RANK[existing.status]) {
      byClient.set(e.client.id, {
        rowId: e.id,
        kind: 'client',
        enrollmentId: e.id,
        refId: e.client.id,
        nume: e.client.nume,
        prenume: e.client.prenume,
        poza: e.client.foto,
        telefon: e.client.telefon,
        status,
        restanta: restantaByClient.get(e.client.id) ?? 0,
        esteZiua: Boolean(
          e.client.data_nasterii &&
            e.client.data_nasterii.slice(5) === todayMmDd,
        ),
      })
    }
  }

  // Merge clienții cu rezervare OPEN pe această zi care NU au fost deja prinși
  // dintr-o înrolare ce acoperă luna (ex. bonus 29-30 iun pe abonamentul de iulie).
  for (const o of openEntries) {
    const s = statusToday.get(o.enrollmentId)
    const status: RosterStatus =
      s === 'Prezent' ? 'prezent' : s === 'Absent' || s === 'Motivat' ? 'absent' : 'absent'
    const existing = byClient.get(o.client.id)
    if (existing) {
      // Rezervarea OPEN a zilei e autoritară: un client cu rezervare validă pe
      // sesiunea de azi NU poate fi „inactiv". Promovăm statusul (și legăm prezența
      // de enrollment-ul rezervării) dacă fusese clasat inactiv din altă înrolare.
      if (existing.status === 'inactiv') {
        byClient.set(o.client.id, {
          ...existing,
          rowId: o.enrollmentId,
          enrollmentId: o.enrollmentId,
          status,
        })
      }
      continue
    }
    byClient.set(o.client.id, {
      rowId: o.enrollmentId,
      kind: 'client',
      enrollmentId: o.enrollmentId,
      refId: o.client.id,
      nume: o.client.nume,
      prenume: o.client.prenume,
      poza: o.client.foto,
      telefon: o.client.telefon,
      status,
      restanta: 0,
      esteZiua: Boolean(
        o.client.data_nasterii && o.client.data_nasterii.slice(5) === todayMmDd,
      ),
    })
  }

  // Leads programați pentru acest curs+data (via tabelul programari_leads).
  // Mapăm leads.status → RosterStatus pentru afișare consistentă cu cursanții.
  const { data: programariRows, error: pgErr } = await supabase
    .from('programari_leads')
    .select(
      'prezenta, lead:leads(id, nume, prenume, status, data_nasterii, id_client)',
    )
    .eq('cursul_programat', params.cursId)
    .eq('data_programarii', params.date)
  if (pgErr) throw pgErr
  const programari = (programariRows ?? []) as unknown as Array<{
    prezenta: string | null
    lead: {
      id: string
      nume: string
      prenume: string | null
      status: string | null
      data_nasterii: string | null
      id_client: string | null
    } | null
  }>
  const seenLeadIds = new Set<string>()
  const leadRows: GrupaRosterRow[] = []
  for (const p of programari) {
    if (!p.lead) continue
    if (seenLeadIds.has(p.lead.id)) continue
    // Lead convertit (id_client setat) al cărui client apare deja ca înrolat pe
    // această grupă: nu-l mai afișăm și ca lead — evită dublura lead+client.
    if (p.lead.id_client && byClient.has(p.lead.id_client)) continue
    // Lead-uri „moarte" (n-au ajuns nicăieri) nu apar în roster. Cele convertite
    // rămân vizibile: pe ziua respectivă chiar au fost prezente — e istoric real.
    if (
      p.lead.status === 'pierdut' ||
      p.lead.status === 'nurture' ||
      p.lead.status === 'waiting_list'
    )
      continue
    seenLeadIds.add(p.lead.id)
    // Statusul afișat vine din prezența per-zi (programari_leads.prezenta), nu din
    // statusul global al lead-ului — acesta se schimbă în timp (ex. → convertit) și
    // ar pierde ce s-a întâmplat efectiv în ziua programării.
    const status: RosterStatus =
      p.prezenta === 'prezent'
        ? 'prezent'
        : p.prezenta === 'absent'
          ? 'absent'
          : 'programat'
    leadRows.push({
      rowId: p.lead.id,
      kind: 'lead',
      enrollmentId: null,
      refId: p.lead.id,
      nume: p.lead.nume,
      prenume: p.lead.prenume,
      poza: null,
      telefon: null,
      status,
      restanta: 0,
      esteZiua: Boolean(
        p.lead.data_nasterii &&
          p.lead.data_nasterii.slice(5) === todayMmDd,
      ),
    })
  }

  const roster: GrupaRosterRow[] = [
    ...Array.from(byClient.values()),
    ...leadRows,
  ].sort(
    (a, b) =>
      a.nume.localeCompare(b.nume, 'ro') ||
      (a.prenume || '').localeCompare(b.prenume || '', 'ro'),
  )

  const counters = roster.reduce(
    (acc, r) => {
      const key =
        r.status === 'prezent'
          ? 'prezenti'
          : r.status === 'absent'
            ? 'absenti'
            : r.status === 'inactiv'
              ? 'inactivi'
              : 'programati'
      acc[key]++
      return acc
    },
    { prezenti: 0, absenti: 0, inactivi: 0, programati: 0 },
  )

  return {
    ...baseHeader,
    roster,
    counters,
  }
}
