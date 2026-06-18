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

// Override preț pe înrolare. Salvează vechiul preț, scrie audit_log cu motiv.
// Nu modifică plăți existente — efectul e pe plățile viitoare ale înrolării
// (sau pe restul curent).
export async function adjustEnrollmentPrice(params: {
  enrollmentId: string
  newSuma: number
  motiv: string
  context?: 'ajustare' | 'reziliere'
}): Promise<void> {
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

  const { error: uErr } = await supabase
    .from('enrollments')
    .update({ suma: params.newSuma, updated: new Date().toISOString() })
    .eq('id', params.enrollmentId)
  if (uErr) throw uErr

  await recordAuditLog({
    action: 'price_override',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: { suma: cur.suma },
    newValue: { suma: params.newSuma },
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

// Mută o înrolare la alt curs (păstrează plata curentă, fără prorata).
// Auditată cu motiv.
export async function moveEnrollmentToCurs(params: {
  enrollmentId: string
  newCursId: string
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const { data: cur, error: gErr } = await supabase
    .from('enrollments')
    .select('id, cursul, client, data_incepere')
    .eq('id', params.enrollmentId)
    .single()
  if (gErr) throw gErr
  if (cur.cursul === params.newCursId) {
    throw new Error('Cursul nou e identic cu cel curent.')
  }

  const locatieId = await getLocatieFromCurs(params.newCursId)

  const { error: uErr } = await supabase
    .from('enrollments')
    .update({ cursul: params.newCursId, updated: new Date().toISOString() })
    .eq('id', params.enrollmentId)
  if (uErr) throw uErr

  // Închide lunile viitoare rămase pe cursul VECHI (cele de după luna mutată),
  // altfel rămân `activ=true` și cursantul apare fantomă în rosterul grupei
  // vechi. Mutarea afectează un singur rând; restul seriei trebuie închis.
  if (cur.data_incepere && cur.client && cur.cursul) {
    const cutoff = endOfMonth(`${cur.data_incepere.slice(0, 7)}-01`)
    const { error: closeErr } = await supabase
      .from('enrollments')
      .update({
        reziliat: true,
        activ: false,
        data_reziliere: new Date().toISOString(),
        motiv_reziliere: `Mutat la alt curs: ${motiv}`,
      })
      .eq('client', cur.client)
      .eq('cursul', cur.cursul)
      .neq('id', params.enrollmentId)
      .eq('reziliat', false)
      .gt('data_incepere', cutoff)
    if (closeErr) throw closeErr
  }

  await recordAuditLog({
    action: 'enrollment_moved',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: { cursul: cur.cursul },
    newValue: { cursul: params.newCursId },
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
      p_motiv: motiv,
    })
    if (nErr) console.error('notify_enrollment_move failed:', nErr.message)
  }
}
