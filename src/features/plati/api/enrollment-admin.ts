// Acțiuni privilegiate pe înrolări: override preț și mutare la alt curs.
// Disponibile pentru manager+/admin/owner. Toate auditează cu motiv obligatoriu.
import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'

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
    .select('id, cursul, client')
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

  await recordAuditLog({
    action: 'enrollment_moved',
    entityType: 'enrollment',
    entityId: params.enrollmentId,
    oldValue: { cursul: cur.cursul },
    newValue: { cursul: params.newCursId },
    reason: motiv,
    locatieId,
  })
}
