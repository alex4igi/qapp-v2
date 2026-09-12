// Acțiuni privilegiate pe înrolări: override preț și mutare la alt curs.
// Disponibile pentru manager+/admin/owner. Toate auditează cu motiv obligatoriu.
import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import { getEnrollmentIncasari } from './incasari'
import { endOfMonth } from './calendar'

// Locația via curs → sala → locatie (pentru filtrul de audit per locație)
async function getLocatieFromCurs(cursId: string | null): Promise<string | null> {
  if (!cursId) return null
  const { data: cursRow } = await supabase
    .from('cursuri')
    .select('sala')
    .eq('id', cursId)
    .single()
  const salaId = (cursRow as { sala?: string } | null)?.sala ?? null
  if (!salaId) return null
  const { data: sala } = await supabase
    .from('sali')
    .select('locatie')
    .eq('id', salaId)
    .single()
  return (sala as { locatie?: string } | null)?.locatie ?? null
}

// Cum se tratează surplusul (plătit − suma nouă) la reducerea unei înrolări plătite.
export type SurplusAction = 'none' | 'allocate' | 'credit' | 'refund'

export type AdjustPriceResult = {
  old_suma: number | null
  new_suma: number
  paid: number
  surplus: number
  action: string
  moved: number
  refunded: number
  credit_left: number
}

// Override preț pe înrolare, prin RPC atomic adjust_enrollment_price:
//   • aliniază suma + suma_baza (repară invariantul suma_baza → fără „reducere" fantomă).
//   • dacă rezultă surplus pe un rând plătit, îl tratează după `surplusAction`:
//       'allocate' → mută min(surplus, rest țintă) pe altă datorie (înrolare/one-off).
//       'refund'   → încasare negativă (banii ies).
//       'credit'   → surplusul rămâne credit vizibil pe profil.
// Auditul + notificarea rămân aici (best-effort, după mutarea atomică de bani).
export async function adjustEnrollmentPrice(params: {
  enrollmentId: string
  newSuma: number
  motiv: string
  context?: 'ajustare' | 'reziliere'
  surplusAction?: SurplusAction
  targetType?: 'enrollment' | 'datorie' | null
  targetId?: string | null
}): Promise<AdjustPriceResult> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')
  if (!Number.isFinite(params.newSuma) || params.newSuma < 0) {
    throw new Error('Suma trebuie să fie un număr pozitiv.')
  }

  const { data: cur, error: gErr } = await supabase
    .from('enrollments')
    .select('id, suma, cursul, client')
    .eq('id', params.enrollmentId)
    .single()
  if (gErr) throw gErr

  const locatieId = await getLocatieFromCurs(cur.cursul)

  const { data, error: rErr } = await supabase.rpc('adjust_enrollment_price', {
    p_enrollment: params.enrollmentId,
    p_new_suma: params.newSuma,
    p_motiv: motiv,
    p_surplus_action: params.surplusAction ?? 'none',
    p_target_type: params.targetType ?? undefined,
    p_target_id: params.targetId ?? undefined,
  })
  if (rErr) throw rErr
  const result = (data ?? {}) as AdjustPriceResult

  await recordAuditLog({
    action: 'price_override',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: { suma: cur.suma },
    newValue: {
      suma: params.newSuma,
      surplus: result.surplus,
      surplus_action: result.action,
      moved: result.moved,
      refunded: result.refunded,
      credit_left: result.credit_left,
    },
    reason: motiv,
    locatieId,
  })

  // Notifică owner+admin la orice modificare efectivă de preț (manager+ → audit
  // intern). Eșecul notificării nu trebuie să anuleze modificarea de preț.
  if (cur.suma !== params.newSuma) {
    const { error: nErr } = await supabase.rpc('notify_price_change', {
      p_enrollment: params.enrollmentId,
      p_old: cur.suma ?? 0,
      p_new: params.newSuma,
      p_motiv: motiv,
      p_context: params.context ?? 'ajustare',
    })
    if (nErr) console.error('notify_price_change failed:', nErr.message)
  }

  return result
}

// Total încasat pe o înrolare (pentru a detecta surplusul în modalul de ajustare).
export async function getEnrollmentPaid(enrollmentId: string): Promise<number> {
  const incasari = await getEnrollmentIncasari(enrollmentId)
  return incasari.reduce((a, i) => a + (i.suma ?? 0), 0)
}

// Ținte pentru alocarea surplusului: orice datorie neachitată a clientului —
// înrolare SAU one-off (bilet/merch/taxă). Cele mai noi primele.
export type SurplusTarget = {
  type: 'enrollment' | 'datorie'
  id: string
  label: string
  rest: number
}

export async function getClientOutstandingCharges(params: {
  clientId: string
  excludeEnrollmentId?: string
}): Promise<SurplusTarget[]> {
  const [{ data: enr, error: eErr }, { data: dat, error: dErr }] = await Promise.all([
    supabase
      .from('plati_inrolari')
      .select('id_enrollment, data_incepere, nume_curs, rest')
      .eq('id_cursant', params.clientId)
      .gt('rest', 0)
      .order('data_incepere', { ascending: false }),
    supabase
      .from('datorii_rest')
      .select('id, categorie, descriere, rest, created')
      .eq('client', params.clientId)
      .gt('rest', 0)
      .order('created', { ascending: false }),
  ])
  if (eErr) throw eErr
  if (dErr) throw dErr

  const targets: SurplusTarget[] = []
  for (const r of enr ?? []) {
    if (r.id_enrollment === params.excludeEnrollmentId) continue
    const luna = (r.data_incepere as string | null)?.slice(0, 7) ?? '—'
    targets.push({
      type: 'enrollment',
      id: r.id_enrollment as string,
      label: `${luna} · ${r.nume_curs ?? 'curs'} — rest ${r.rest} lei`,
      rest: Number(r.rest),
    })
  }
  for (const d of dat ?? []) {
    const desc = d.descriere ? ` · ${d.descriere}` : ''
    targets.push({
      type: 'datorie',
      id: d.id as string,
      label: `${d.categorie}${desc} — rest ${d.rest} lei`,
      rest: Number(d.rest),
    })
  }
  return targets
}

// Credit total în favoarea clientului = |suma resturilor negative| pe înrolări +
// datorii one-off (bani plătiți în plus, disponibili pentru alocare).
export async function getClientCredit(clientId: string): Promise<number> {
  const [{ data: enr }, { data: dat }] = await Promise.all([
    supabase.from('plati_inrolari').select('rest').eq('id_cursant', clientId).lt('rest', 0),
    supabase.from('datorii_rest').select('rest').eq('client', clientId).lt('rest', 0),
  ])
  const sum = [...(enr ?? []), ...(dat ?? [])].reduce((a, r) => a + Number(r.rest), 0)
  return Math.abs(Math.min(sum, 0))
}

export type UseCreditResult = {
  used: number
  action: string
  target_type: string | null
  target_id: string | null
  available: number
  remaining_credit: number
}

// Folosește creditul existent al clientului: îl alocă pe o datorie (înrolare/one-off)
// sau îl restituie. Consumă rândurile cu rest negativ vechi→nou, prin RPC atomic.
export async function useClientCredit(params: {
  clientId: string
  amount: number
  action: 'allocate' | 'refund'
  targetType?: 'enrollment' | 'datorie' | null
  targetId?: string | null
  motiv?: string | null
}): Promise<UseCreditResult> {
  const { data, error } = await supabase.rpc('use_client_credit', {
    p_client: params.clientId,
    p_amount: params.amount,
    p_action: params.action,
    p_target_type: params.targetType ?? undefined,
    p_target_id: params.targetId ?? undefined,
    p_motiv: params.motiv?.trim() || undefined,
  })
  if (error) throw error
  const result = (data ?? {}) as UseCreditResult

  await recordAuditLog({
    action: 'incasare_modified',
    entityType: 'client',
    entityId: params.clientId,
    newValue: {
      used: result.used,
      action: result.action,
      target_type: result.target_type,
      target_id: result.target_id,
    },
    reason: params.motiv?.trim() || `Folosire credit (${params.action})`,
  })

  return result
}

// Previzualizare recalcul „ultima lună" la reziliere mid-lună: prețul de
// recuperare (cursuri.pret_sedinta_reziliere) × ședințe PREZENT în luna curentă.
// Aplicabil doar dacă există înrolare pe luna curentă și NU e deja plătită
// (luna plătită integral rămâne la preț întreg, conform contractului).
export type ReziliereRecalcPreview = {
  applicable: boolean
  reason?: string
  enrollmentId?: string
  sedinte?: number
  pretSedintaReziliere?: number
  suma?: number
}

async function loadReziliereRecalc(
  clientId: string,
  cursId: string,
): Promise<ReziliereRecalcPreview> {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Înrolarea lunii curente (Per lună, activă, nereziliată) care acoperă azi
  const { data: enr, error: eErr } = await supabase
    .from('enrollments')
    .select('id, suma, data_incepere, data_final')
    .eq('client', clientId)
    .eq('cursul', cursId)
    .eq('tip_plata', 'Per luna')
    .eq('reziliat', false)
    .lte('data_incepere', todayStr)
    .gte('data_final', todayStr)
    .limit(1)
  if (eErr) throw eErr
  const row = enr?.[0]
  if (!row) {
    return { applicable: false, reason: 'Nu există înrolare pe luna curentă.' }
  }

  // Deja plătită? (orice încasare legată de înrolare) → nu recalculăm
  const incasari = await getEnrollmentIncasari(row.id)
  if (incasari.length > 0) {
    return {
      applicable: false,
      reason: 'Luna curentă e deja plătită — rămâne la preț întreg (contract).',
    }
  }

  // Prețul de recuperare al cursului
  const { data: curs, error: cErr } = await supabase
    .from('cursuri')
    .select('pret_sedinta_reziliere')
    .eq('id', cursId)
    .single()
  if (cErr) throw cErr
  const pret = curs?.pret_sedinta_reziliere
  if (pret == null || pret <= 0) {
    return {
      applicable: false,
      reason: 'Cursul nu are setat un preț ședință (reziliere).',
    }
  }

  // Ședințe PREZENT în luna curentă pentru această înrolare
  const monthStart = `${todayStr.slice(0, 7)}-01`
  const monthEnd = endOfMonth(monthStart)
  const { count, error: pErr } = await supabase
    .from('prezente')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment', row.id)
    .eq('status', 'Prezent')
    .gte('data', monthStart)
    .lte('data', monthEnd)
  if (pErr) throw pErr
  const sedinte = count ?? 0

  return {
    applicable: true,
    enrollmentId: row.id,
    sedinte,
    pretSedintaReziliere: pret,
    suma: sedinte * pret,
  }
}

export async function getReziliereRecalcPreview(params: {
  clientId: string
  cursId: string
}): Promise<ReziliereRecalcPreview> {
  return loadReziliereRecalc(params.clientId, params.cursId)
}

// Recalculează suma ultimei luni (luna curentă) la prețul de recuperare.
// Reutilizează adjustEnrollmentPrice → audit + notificare admini automat.
export async function recalcUltimaLunaReziliere(params: {
  clientId: string
  cursId: string
}): Promise<ReziliereRecalcPreview> {
  const preview = await loadReziliereRecalc(params.clientId, params.cursId)
  if (!preview.applicable || !preview.enrollmentId) return preview
  await adjustEnrollmentPrice({
    enrollmentId: preview.enrollmentId,
    newSuma: preview.suma!,
    motiv: `Recuperare reziliere: ${preview.sedinte} ședințe × ${preview.pretSedintaReziliere} RON`,
    context: 'reziliere',
  })
  return preview
}

// ── Motivare absență cu adeverință medicală ──────────────────────────────────
// Context pentru modalul de motivare: luna înrolării, absențele lunii, pragul de
// scutire (2 × ședințe/săpt) și documentele Medicale disponibile pentru cursant.
export type MotivareAbsentaContext = {
  enrollmentId: string
  clientId: string
  clientNume: string | null
  cursNume: string | null
  luna: string // YYYY-MM-01
  tipPlata: string | null
  sedintePerSapt: number
  absente: number
  prag: number
  eligibilScutire: boolean
  documenteMedicale: { id: string; titlu: string | null; link: string; created: string }[]
}

export async function getMotivareAbsentaContext(
  enrollmentId: string,
): Promise<MotivareAbsentaContext> {
  const { data: enr, error: eErr } = await supabase
    .from('enrollments')
    .select('id, data_incepere, tip_plata, client, cursul(numele, zile)')
    .eq('id', enrollmentId)
    .single()
  if (eErr) throw eErr
  const row = enr as unknown as {
    id: string
    data_incepere: string | null
    tip_plata: string | null
    client: string | null
    cursul: { numele: string | null; zile: string[] | null } | null
  }
  if (!row.data_incepere) throw new Error('Înrolarea nu are lună (data_incepere).')

  const luna = `${row.data_incepere.slice(0, 7)}-01`
  const lunaEnd = endOfMonth(luna)
  const sedintePerSapt = row.cursul?.zile?.length ?? 0
  const prag = 2 * sedintePerSapt

  // Trebuie să numere EXACT ce numără aproba_motivare_absenta (migrația
  // 20260621180000): 'Absent' + 'Motivat'. Prima aprobare pe lună transformă
  // absențele în 'Motivat', deci filtrul pe 'Absent' arăta 0 la a doua aprobare
  // („sub prag, fără scutire") în timp ce DB-ul acorda scutirea.
  const { count, error: pErr } = await supabase
    .from('prezente')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment', enrollmentId)
    .in('status', ['Absent', 'Motivat'])
    .gte('data', luna)
    .lte('data', lunaEnd)
  if (pErr) throw pErr
  const absente = count ?? 0

  let clientNume: string | null = null
  let documenteMedicale: MotivareAbsentaContext['documenteMedicale'] = []
  if (row.client) {
    const { data: cl } = await supabase
      .from('clienti')
      .select('nume, prenume')
      .eq('id', row.client)
      .single()
    if (cl) clientNume = `${cl.nume ?? ''} ${cl.prenume ?? ''}`.trim()

    const { data: docs } = await supabase
      .from('documente_client')
      .select('id, titlu, link, created')
      .eq('client', row.client)
      .eq('tip', 'Medical')
      .order('created', { ascending: false })
    documenteMedicale = (docs ?? []) as MotivareAbsentaContext['documenteMedicale']
  }

  return {
    enrollmentId,
    clientId: row.client ?? '',
    clientNume,
    cursNume: row.cursul?.numele ?? null,
    luna,
    tipPlata: row.tip_plata,
    sedintePerSapt,
    absente,
    prag,
    eligibilScutire: row.tip_plata === 'Per luna' && sedintePerSapt > 0 && absente > prag,
    documenteMedicale,
  }
}

export type MotivareAbsentaResult = {
  motivate: number
  absente: number
  prag: number
  scutit: boolean
  credit: 'niciun' | 'luna_urmatoare' | 'sold_favoare'
  luna: string
}

export async function aprobaMotivareAbsenta(params: {
  enrollmentId: string
  document?: string | null
  observatii?: string | null
}): Promise<MotivareAbsentaResult> {
  const { data, error } = await supabase.rpc('aproba_motivare_absenta', {
    p_enrollment: params.enrollmentId,
    p_document: params.document ?? undefined,
    p_observatii: params.observatii?.trim() || undefined,
  })
  if (error) throw error
  return data as MotivareAbsentaResult
}

// Șterge fizic o înrolare creată din greșeală (ex: dublu-submit → duplicat pe
// același curs). Gărzile reale (rol manager+ și „fără încasări") sunt în RPC-ul
// sterge_inrolare; aici capturăm snapshotul pentru audit înainte de ștergere.
export async function deleteInrolareDuplicat(params: {
  enrollmentId: string
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const { data: snapshot, error: gErr } = await supabase
    .from('enrollments')
    .select('id, client, cursul, suma, data_incepere, tip_plata')
    .eq('id', params.enrollmentId)
    .single()
  if (gErr) throw gErr

  const locatieId = await getLocatieFromCurs(snapshot.cursul)

  const { error: dErr } = await supabase.rpc('sterge_inrolare', {
    p_enrollment: params.enrollmentId,
    p_motiv: motiv,
  })
  if (dErr) throw dErr

  await recordAuditLog({
    action: 'enrollment_deleted',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: snapshot,
    reason: motiv,
    locatieId,
  })
}

// ── Conversie ședințe → abonament (pe lună) ──────────────────────────────────
// Simetric cu convertAbonamentInSedinte: pornim de la o ședință, dar convertim
// TOATE ședințele active ale clientului la acel curs din luna ei. Prețul e pe luna
// întreagă, iar ce s-a plătit deja pe ședințe devine avans. Vezi RPC
// converteste_sedinte_in_abonament.
export type SedinteToAbonamentPreview = {
  applicable: boolean
  reason?: string
  clientId?: string
  cursId?: string
  cursNume?: string
  luna?: string // YYYY-MM-01
  sedinte?: { data: string; platit: number }[]
  pretLunar?: number
  platit?: number
  deIncasat?: number
  credit?: number
}

async function loadSedinteToAbonament(
  enrollmentId: string,
): Promise<SedinteToAbonamentPreview> {
  const { data: enr, error: eErr } = await supabase
    .from('enrollments')
    .select('id, client, cursul, tip_plata, data_incepere, reziliat')
    .eq('id', enrollmentId)
    .single()
  if (eErr) throw eErr
  if (enr.reziliat) return { applicable: false, reason: 'Ședința e deja reziliată.' }
  if (enr.tip_plata !== 'Per sedinta') {
    return {
      applicable: false,
      reason: 'Doar înrolările „Per sedinta" se pot converti în abonament.',
    }
  }
  if (!enr.data_incepere || !enr.cursul || !enr.client) {
    return { applicable: false, reason: 'Ședința nu are dată sau curs asociat.' }
  }

  const { data: curs, error: cErr } = await supabase
    .from('cursuri')
    .select('numele, pret_lunar')
    .eq('id', enr.cursul)
    .single()
  if (cErr) throw cErr
  const pretLunar = curs?.pret_lunar
  if (pretLunar == null || pretLunar <= 0) {
    return { applicable: false, reason: 'Cursul nu are „Preț lunar" setat.' }
  }

  const luna = `${enr.data_incepere.slice(0, 7)}-01`
  const lunaEnd = endOfMonth(luna)

  // Gard identic cu RPC-ul: un singur abonament pe (client, curs, lună).
  const { data: existing, error: aErr } = await supabase
    .from('enrollments')
    .select('id')
    .eq('client', enr.client)
    .eq('cursul', enr.cursul)
    .eq('tip_plata', 'Per luna')
    .eq('reziliat', false)
    .gte('data_incepere', luna)
    .lte('data_incepere', lunaEnd)
  if (aErr) throw aErr
  if ((existing ?? []).length > 0) {
    return {
      applicable: false,
      reason: 'Există deja un abonament activ pe luna respectivă.',
    }
  }

  const { data: sedinte, error: sErr } = await supabase
    .from('enrollments')
    .select('id, data_incepere')
    .eq('client', enr.client)
    .eq('cursul', enr.cursul)
    .eq('tip_plata', 'Per sedinta')
    .eq('reziliat', false)
    .gte('data_incepere', luna)
    .lte('data_incepere', lunaEnd)
    .order('data_incepere', { ascending: true })
  if (sErr) throw sErr
  const ids = (sedinte ?? []).map((s) => s.id)
  if (ids.length === 0) {
    return { applicable: false, reason: 'Nicio ședință activă în luna respectivă.' }
  }

  const { data: incasari, error: iErr } = await supabase
    .from('incasari')
    .select('inregistrare, suma')
    .in('inregistrare', ids)
  if (iErr) throw iErr
  const platitPerSedinta = new Map<string, number>()
  for (const i of incasari ?? []) {
    if (!i.inregistrare) continue
    platitPerSedinta.set(
      i.inregistrare,
      (platitPerSedinta.get(i.inregistrare) ?? 0) + (i.suma ?? 0),
    )
  }
  const platit = [...platitPerSedinta.values()].reduce((a, b) => a + b, 0)

  return {
    applicable: true,
    clientId: enr.client,
    cursId: enr.cursul,
    cursNume: curs?.numele ?? undefined,
    luna,
    sedinte: (sedinte ?? []).map((s) => ({
      data: s.data_incepere as string,
      platit: platitPerSedinta.get(s.id) ?? 0,
    })),
    pretLunar,
    platit,
    deIncasat: Math.max(pretLunar - platit, 0),
    credit: Math.max(platit - pretLunar, 0),
  }
}

export async function getSedinteToAbonamentPreview(params: {
  enrollmentId: string
}): Promise<SedinteToAbonamentPreview> {
  return loadSedinteToAbonament(params.enrollmentId)
}

export async function convertSedinteInAbonament(params: {
  clientId: string
  cursId: string
  luna: string
  motiv?: string
}): Promise<{
  converted?: boolean
  enrollment?: string
  luna?: string
  sedinte?: number
  pret?: number
  platit?: number
  de_incasat?: number
  credit?: number
}> {
  const locatieId = await getLocatieFromCurs(params.cursId)

  const { data, error } = await supabase.rpc('converteste_sedinte_in_abonament', {
    p_client: params.clientId,
    p_curs: params.cursId,
    p_luna: params.luna,
    p_motiv: params.motiv?.trim() || undefined,
  })
  if (error) throw error
  const result = (data ?? {}) as {
    converted?: boolean
    enrollment?: string
    luna?: string
    sedinte?: number
    pret?: number
    platit?: number
    de_incasat?: number
    credit?: number
  }

  if (result.converted) {
    await recordAuditLog({
      action: 'sedinte_to_abonament',
      entityType: 'enrollment',
      entityId: result.enrollment ?? params.cursId,
      oldValue: { sedinte: result.sedinte, platit: result.platit },
      newValue: {
        luna: result.luna,
        pret: result.pret,
        de_incasat: result.de_incasat,
        credit: result.credit,
      },
      reason: params.motiv?.trim() || 'Conversie ședințe → abonament',
      locatieId,
    })
  }
  return result
}

// ── Conversie abonament „Per luna" (facultativ) → ședințe ────────────────────
// Invers față de convertSedintaInAbonament. Se încasează DOAR ședințele deja
// prezente în luna curentă; surplusul de bani rămâne credit. Vezi RPC
// converteste_abonament_in_sedinte.
export type AbonamentToSedintePreview = {
  applicable: boolean
  reason?: string
  enrollmentId?: string
  luna?: string // YYYY-MM-01
  sedinte?: number
  dates?: string[]
  pretSedinta?: number
  total?: number
  platit?: number
  credit?: number
  datorie?: number
}

async function loadAbonamentToSedinte(
  enrollmentId: string,
): Promise<AbonamentToSedintePreview> {
  const { data: enr, error: eErr } = await supabase
    .from('enrollments')
    .select('id, tip_plata, data_incepere, cursul, reziliat')
    .eq('id', enrollmentId)
    .single()
  if (eErr) throw eErr
  if (enr.reziliat) {
    return { applicable: false, reason: 'Înrolarea e deja reziliată.' }
  }
  if (enr.tip_plata !== 'Per luna') {
    return {
      applicable: false,
      reason: 'Doar abonamentele „Per luna" se pot converti în ședințe.',
    }
  }
  if (!enr.data_incepere) {
    return { applicable: false, reason: 'Abonamentul nu are lună (data_incepere).' }
  }
  if (!enr.cursul) {
    return { applicable: false, reason: 'Înrolarea nu are curs asociat.' }
  }

  const { data: curs, error: cErr } = await supabase
    .from('cursuri')
    .select('facultativ, pret_sedinta')
    .eq('id', enr.cursul)
    .single()
  if (cErr) throw cErr
  if (!curs?.facultativ) {
    return {
      applicable: false,
      reason: 'Conversia în ședințe e disponibilă doar pentru cursuri facultative.',
    }
  }
  const pret = curs.pret_sedinta
  if (pret == null || pret <= 0) {
    return { applicable: false, reason: 'Cursul nu are „Preț ședință" setat.' }
  }

  const luna = `${enr.data_incepere.slice(0, 7)}-01`
  const lunaEnd = endOfMonth(luna)

  const { data: prez, error: pErr } = await supabase
    .from('prezente')
    .select('data')
    .eq('enrollment', enrollmentId)
    .eq('status', 'Prezent')
    .gte('data', luna)
    .lte('data', lunaEnd)
    .order('data', { ascending: true })
  if (pErr) throw pErr
  const dates = (prez ?? []).map((r) => r.data as string)

  const incasari = await getEnrollmentIncasari(enrollmentId)
  const platit = incasari.reduce((a, i) => a + (i.suma ?? 0), 0)
  const total = dates.length * pret

  return {
    applicable: true,
    enrollmentId,
    luna,
    sedinte: dates.length,
    dates,
    pretSedinta: pret,
    total,
    platit,
    credit: Math.max(platit - total, 0),
    datorie: Math.max(total - platit, 0),
  }
}

export async function getAbonamentToSedintePreview(params: {
  enrollmentId: string
}): Promise<AbonamentToSedintePreview> {
  return loadAbonamentToSedinte(params.enrollmentId)
}

export async function convertAbonamentInSedinte(params: {
  enrollmentId: string
  motiv?: string
}): Promise<{
  already_converted?: boolean
  converted?: boolean
  sedinte?: number
  credit?: number
  datorie?: number
}> {
  const { data: cur } = await supabase
    .from('enrollments')
    .select('cursul, suma, tip_plata')
    .eq('id', params.enrollmentId)
    .single()
  const locatieId = await getLocatieFromCurs(cur?.cursul ?? null)

  const { data, error } = await supabase.rpc('converteste_abonament_in_sedinte', {
    p_abonament: params.enrollmentId,
    p_motiv: params.motiv?.trim() || undefined,
  })
  if (error) throw error
  const result = (data ?? {}) as {
    already_converted?: boolean
    converted?: boolean
    sedinte?: number
    credit?: number
    datorie?: number
  }

  if (result.converted) {
    await recordAuditLog({
      action: 'abonament_to_sedinte',
      entityType: 'enrollment',
      entityId: params.enrollmentId,
      oldValue: { tip_plata: cur?.tip_plata, suma: cur?.suma },
      newValue: {
        sedinte: result.sedinte,
        credit: result.credit,
        datorie: result.datorie,
      },
      reason: params.motiv?.trim() || 'Conversie abonament → ședințe',
      locatieId,
    })
  }
  return result
}

// ── Mutare între cursuri ─────────────────────────────────────────────────────
// O mutare mută SERIA: luna selectată + toate lunile ulterioare pe cursul vechi.
// Gardurile (rol, dublură pe cursul nou, sezonul cursului nou) + repreţuirea
// lunilor viitoare stau în RPC-ul atomic `muta_inrolare_curs`.
export type MoveEnrollmentResult = {
  simulare: boolean
  mutate: number
  luni: string[]
  repretuite: number
  platite: number
  tarif: number | null
  tarif_promo: number | null
  // Trupele nu au preț de reînscriere: la mutarea într-o trupă promo-ul se
  // pierde, iar lunile neplătite trec pe tariful trupei.
  promo_pierdut: boolean
  promo_luni: number
  promo_platite: number
}

// Preview cu aceleași garduri ca mutarea reală, fără scriere — modalul îl
// folosește ca să arate ce se mută și să blocheze submit-ul pe conflicte.
export async function previewMoveEnrollment(params: {
  enrollmentId: string
  newCursId: string
  aplicaTarifNou: boolean
}): Promise<MoveEnrollmentResult> {
  const { data, error } = await supabase.rpc('muta_inrolare_curs', {
    p_enrollment: params.enrollmentId,
    p_curs_nou: params.newCursId,
    p_motiv: 'preview',
    p_aplica_tarif_nou: params.aplicaTarifNou,
    p_simulare: true,
  })
  if (error) throw error
  return data as MoveEnrollmentResult
}

export async function moveEnrollmentToCurs(params: {
  enrollmentId: string
  newCursId: string
  motiv: string
  aplicaTarifNou?: boolean
}): Promise<MoveEnrollmentResult> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const { data: cur, error: gErr } = await supabase
    .from('enrollments')
    .select('id, cursul, client')
    .eq('id', params.enrollmentId)
    .single()
  if (gErr) throw gErr

  const locatieId = await getLocatieFromCurs(params.newCursId)

  const { data, error } = await supabase.rpc('muta_inrolare_curs', {
    p_enrollment: params.enrollmentId,
    p_curs_nou: params.newCursId,
    p_motiv: motiv,
    p_aplica_tarif_nou: params.aplicaTarifNou ?? true,
    p_simulare: false,
  })
  if (error) throw error
  const result = data as MoveEnrollmentResult

  await recordAuditLog({
    action: 'enrollment_moved',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: { cursul: cur.cursul, luni: result.luni },
    newValue: {
      cursul: params.newCursId,
      mutate: result.mutate,
      repretuite: result.repretuite,
    },
    reason: motiv,
    locatieId,
  })

  // Notifică managerul (+ owner/admin) la mutare — informativ, fără aprobare.
  // Eșecul notificării nu trebuie să anuleze mutarea.
  if (cur.cursul) {
    const { error: nErr } = await supabase.rpc('notify_enrollment_move', {
      p_enrollment: params.enrollmentId,
      p_from_curs: cur.cursul,
      p_to_curs: params.newCursId,
      p_motiv:
        result.mutate > 1 ? `${motiv} (${result.mutate} luni)` : motiv,
    })
    if (nErr) console.error('notify_enrollment_move failed:', nErr.message)
  }

  return result
}

// Corectează data unei înrolări greșite la înregistrare (ex. ședință trecută pe
// altă zi). Gardurile (fereastra front_desk, luna întreagă la „Per luna",
// prezențe/rezervări OPEN) sunt în RPC; încasările nu se ating.
export async function corecteazaDataInrolare(params: {
  enrollmentId: string
  dataNoua: string
  motiv: string
}): Promise<{ changed: boolean }> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const { data: cur, error: gErr } = await supabase
    .from('enrollments')
    .select('cursul, data_incepere')
    .eq('id', params.enrollmentId)
    .single()
  if (gErr) throw gErr

  const { data, error } = await supabase.rpc('corecteaza_data_inrolare', {
    p_enrollment: params.enrollmentId,
    p_data_noua: params.dataNoua,
    p_motiv: motiv,
  })
  if (error) throw error
  const result = (data ?? {}) as {
    changed?: boolean
    new_data_incepere?: string
  }

  if (result.changed) {
    const locatieId = await getLocatieFromCurs(cur.cursul)
    await recordAuditLog({
      action: 'enrollment_date_corrected',
      entityType: 'enrollment',
      entityId: params.enrollmentId,
      oldValue: { data_incepere: cur.data_incepere },
      newValue: { data_incepere: result.new_data_incepere ?? params.dataNoua },
      reason: motiv,
      locatieId,
    })
  }
  return { changed: Boolean(result.changed) }
}
