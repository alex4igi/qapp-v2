import { supabase } from '@/lib/supabase'
import type { Curs, InsertDto, UpdateDto } from '@/types/db'

export async function getCurs(id: string): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Câte prezențe „Prezent" are cursul. Gard înainte de mutarea lui în alt sezon: un curs
// deja predat își duce toată istoria cu el, iar salariile și rapoartele se citesc pe
// sezonul lunii — mutarea îl scoate tăcut din lunile în care a fost ținut (vezi migrația
// 20260828210000). JOIN pe curs, nu `.in(enrollmentIds)`: facultativele au sute de
// înrolări și un `.in()` sparge URL-ul.
export async function countPrezenteCurs(cursId: string): Promise<number> {
  const { count, error } = await supabase
    .from('prezente')
    .select('id, enr:enrollments!inner(cursul)', { count: 'exact', head: true })
    .eq('enr.cursul', cursId)
    .eq('status', 'Prezent')
  if (error) throw error
  return count ?? 0
}

export async function createCurs(dto: InsertDto<'cursuri'>): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCurs(
  id: string,
  dto: UpdateDto<'cursuri'>,
): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Ștergere definitivă (admin). RPC-ul blochează dacă cursul are dependențe
// (înrolări, evaluări, reînscrieri, sesiuni OPEN, clone) și scrie în audit_log.
// Pentru cursuri create din greșeală (fără dependențe) se șterge curat.
// force=true sare peste gardă: șterge chiar dacă există dependențe (FK ON DELETE
// SET NULL/CASCADE le orfanizează). Adminul își asumă consecințele din UI.
export async function deleteCurs(id: string, force = false): Promise<void> {
  const { error } = await supabase.rpc('delete_curs_safe', { p_id: id, p_force: force })
  if (error) throw error
}

// Suspendare/re-activare curs, cu LUNA de la care se aplică. Intervalul, flagul
// `cursuri.suspendat` (cache pentru „acum") și urma din audit_log se scriu într-o
// singură tranzacție, în RPC — vezi migrația 20260913180000.
export async function setCursSuspendare(params: {
  cursId: string
  suspenda: boolean
  /** Ziua 1 a lunii de la care se aplică ("YYYY-MM-01"). */
  dinLuna: string
  motiv?: string
}): Promise<void> {
  const { error } = await supabase.rpc('set_curs_suspendare', {
    p_curs: params.cursId,
    p_suspenda: params.suspenda,
    p_din_luna: params.dinLuna,
    p_motiv: params.motiv?.trim() || undefined,
  })
  if (error) throw error
}

export type CursSuspendare = {
  id: string
  din_luna: string
  motiv: string
}

// Suspendarea DESCHISĂ a cursului (pana_luna null), dacă există. Re-activarea are
// nevoie de luna ei: nu se poate reporni dintr-o lună dinaintea opririi.
export async function getSuspendareDeschisa(
  cursId: string,
): Promise<CursSuspendare | null> {
  const { data, error } = await supabase
    .from('cursuri_suspendari')
    .select('id, din_luna, motiv')
    .eq('curs', cursId)
    .is('pana_luna', null)
    .maybeSingle()
  if (error) throw error
  return data
}

// „Grupa se ținea în luna asta?" — aceeași funcție pe care o întreabă salariul,
// ca UI-ul să nu-și inventeze o a doua definiție a suspendării.
export async function cursActivInLuna(
  cursId: string,
  dataIso: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('curs_activ_in_luna', {
    p_curs: cursId,
    p_luna: `${dataIso.slice(0, 7)}-01`,
  })
  if (error) throw error
  return data !== false
}
