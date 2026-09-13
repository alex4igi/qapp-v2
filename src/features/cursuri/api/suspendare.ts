import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import {
  adjustEnrollmentPrice,
  moveEnrollmentToCurs,
} from '@/features/plati/api'

export type CursantAfectat = {
  clientId: string
  nume: string
  prenume: string | null
  /** Toate înrolările din luna suspendării încolo, crescător după lună. */
  enrollmentIds: string[]
  /** Cea mai veche din interval — pe ea se cheamă mutarea, care ia seria întreagă. */
  primaInrolareId: string
  luni: string[]
  suma: number
}

// Cursanții pe care-i prinde suspendarea: înrolări NEreziliate din luna opririi
// încolo. Lunile dinainte nu se ating — ele s-au ținut și s-au plătit.
export async function getCursantiAfectatiDeSuspendare(
  cursId: string,
  dinLuna: string,
): Promise<CursantAfectat[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, suma, data_incepere, client(id, nume, prenume)')
    .eq('cursul', cursId)
    .eq('reziliat', false)
    .gte('data_incepere', dinLuna)
    .order('data_incepere', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    suma: number | null
    data_incepere: string | null
    client: { id: string; nume: string; prenume: string | null } | null
  }>

  const byClient = new Map<string, CursantAfectat>()
  for (const r of rows) {
    if (!r.client) continue
    const existing = byClient.get(r.client.id)
    const luna = (r.data_incepere ?? '').slice(0, 7)
    if (existing) {
      existing.enrollmentIds.push(r.id)
      if (luna && !existing.luni.includes(luna)) existing.luni.push(luna)
      existing.suma += r.suma ?? 0
    } else {
      byClient.set(r.client.id, {
        clientId: r.client.id,
        nume: r.client.nume,
        prenume: r.client.prenume,
        enrollmentIds: [r.id],
        primaInrolareId: r.id,
        luni: luna ? [luna] : [],
        suma: r.suma ?? 0,
      })
    }
  }
  return [...byClient.values()].sort((a, b) => a.nume.localeCompare(b.nume, 'ro'))
}

export type TriajSuspendare =
  | { tip: 'nimic' }
  | { tip: 'muta'; cursNouId: string }
  | { tip: 'reziliaza' }
  | { tip: 'scuteste' }

export type TriajRezultat = {
  cursantiAtinsi: number
  inrolariAtinse: number
}

// Ce se întâmplă cu cursanții unei grupe care se oprește. Se aplică ÎNAINTE de
// suspendarea propriu-zisă: dacă ceva eșuează, grupa rămâne activă și se vede ce
// n-a mers, în loc să rămână oprită cu oamenii în aer.
export async function aplicaTriajSuspendare(params: {
  cursId: string
  dinLuna: string
  triaj: TriajSuspendare
  motiv: string
}): Promise<TriajRezultat> {
  if (params.triaj.tip === 'nimic') {
    return { cursantiAtinsi: 0, inrolariAtinse: 0 }
  }

  const afectati = await getCursantiAfectatiDeSuspendare(
    params.cursId,
    params.dinLuna,
  )
  if (afectati.length === 0) return { cursantiAtinsi: 0, inrolariAtinse: 0 }

  const lunaLabel = params.dinLuna.slice(0, 7)
  const motiv = `Suspendare grupă din ${lunaLabel}: ${params.motiv}`.trim()
  const erori: string[] = []
  let inrolariAtinse = 0

  for (const c of afectati) {
    const nume = `${c.nume} ${c.prenume ?? ''}`.trim()
    try {
      if (params.triaj.tip === 'muta') {
        // Mutarea ia seria întreagă de la rândul dat încolo, deci un singur apel
        // per cursant acoperă toate lunile din suspendare.
        await moveEnrollmentToCurs({
          enrollmentId: c.primaInrolareId,
          newCursId: params.triaj.cursNouId,
          motiv,
          aplicaTarifNou: true,
        })
        inrolariAtinse += c.enrollmentIds.length
      } else if (params.triaj.tip === 'scuteste') {
        for (const id of c.enrollmentIds) {
          // Surplusul rămâne CREDIT pe client: dacă a plătit deja luna care nu se
          // mai ține, banii rămân la el, vizibili pe profil, nu se întorc tăcut.
          await adjustEnrollmentPrice({
            enrollmentId: id,
            newSuma: 0,
            motiv,
            surplusAction: 'credit',
          })
          inrolariAtinse += 1
        }
      } else {
        await rezilieazaInrolariDinLuna(c.enrollmentIds, motiv)
        inrolariAtinse += c.enrollmentIds.length
      }
    } catch (e) {
      erori.push(`${nume}: ${e instanceof Error ? e.message : 'eroare'}`)
    }
  }

  if (erori.length > 0) {
    throw new Error(
      `${erori.length} din ${afectati.length} cursanți n-au putut fi procesați. ` +
        `Grupa NU a fost suspendată. ${erori.slice(0, 3).join(' · ')}` +
        (erori.length > 3 ? ' …' : ''),
    )
  }

  return { cursantiAtinsi: afectati.length, inrolariAtinse }
}

// Rezilierea din fișa clientului taie lunile de după cea CURENTĂ. Aici tăietura
// e luna suspendării, care poate fi în viitor — altfel o oprire din noiembrie ar
// rezilia și octombrie, lună care se ține normal.
async function rezilieazaInrolariDinLuna(
  enrollmentIds: string[],
  motiv: string,
): Promise<void> {
  const { error } = await supabase
    .from('enrollments')
    .update({
      reziliat: true,
      activ: false,
      suma: 0,
      suma_baza: 0,
      motiv_reziliere: motiv,
      data_reziliere: new Date().toISOString(),
    })
    .in('id', enrollmentIds)
  if (error) throw error

  for (const id of enrollmentIds) {
    await recordAuditLog({
      action: 'enrollment_reziliata',
      entityType: 'enrollment',
      entityId: id,
      reason: motiv,
    })
  }
}
