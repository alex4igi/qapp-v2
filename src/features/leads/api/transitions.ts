import { supabase } from '@/lib/supabase'
import type { Lead, StatusLead, SubStatusLead, UpdateDto, Enums } from '@/types/db'
import { prependObservatie } from '../constants'
import { triggerLeadSms } from '../sms'
import { normalize, type LeadForm } from './crud'

export type CanalContact = Enums<'canal_contact'>
export type RezultatContact = Enums<'rezultat_contact'>

// Sincronizează prezența în programari_leads cu statusul lead-ului:
// a_venit → prezent, nu_a_venit → absent. Atinge cea mai recentă programare
// (corecțiile prezent↔absent trebuie să se reflecte; reprogramările vechi rămân).
async function syncProgramarePrezenta(
  leadId: string,
  status: StatusLead,
): Promise<void> {
  const prezenta =
    status === 'a_venit'
      ? 'prezent'
      : status === 'nu_a_venit'
        ? 'absent'
        : null
  if (!prezenta) return
  const { data: latest } = await supabase
    .from('programari_leads')
    .select('id')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest) {
    await supabase
      .from('programari_leads')
      .update({ prezenta })
      .eq('id', latest.id)
  }
}

// Când un lead devine nu_a_venit: marchează programarea absent (triggerul DB
// recalculează nr_neprezentari), apoi decide statusul efectiv — a 2-a
// neprezentare merge direct în nurture (fără SMS). Întoarce statusul de scris.
//
// Gard (același ca `prune_expired_leads` pasul 2a): NU muta în nurture cât timp
// mai există o programare azi/viitoare — altfel leadul dispare din roster (care
// filtrează pe status global) deși are o programare validă. Nurture-ul îl preia
// prune-ul abia după ce toate programările au trecut.
async function resolveNoShow(leadId: string): Promise<StatusLead> {
  await syncProgramarePrezenta(leadId, 'nu_a_venit')
  const { data } = await supabase
    .from('leads')
    .select('nr_neprezentari')
    .eq('id', leadId)
    .single()
  if ((data?.nr_neprezentari ?? 0) < 2) return 'nu_a_venit'

  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('programari_leads')
    .select('id', { count: 'exact', head: true })
    .eq('lead', leadId)
    .gte('data_programarii', today)
  return (count ?? 0) > 0 ? 'nu_a_venit' : 'nurture'
}

// Mută lead-urile cu programări doar în trecut din `programat` → `nu_a_venit`
// și marchează programările expirate ca `absent`. Apelată la load /leads.
export async function pruneExpiredLeads(): Promise<void> {
  const { error } = await supabase.rpc('prune_expired_leads')
  if (error) throw error
}

// Readuce un lead din pool-ul Nurture în coloana „Nou". Resetează contorul de
// contactări ca să nu recadă imediat în Nurture (cronul auto-Nurture la >=4).
// Fără SMS de bun-venit — leadul e existent, nu nou.
export async function reactivateFromNurture(id: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'nou',
      sub_status: null,
      nr_contactari: 0,
      flag_reminder: false,
    })
    .eq('id', id)
  if (error) throw error
}

export async function updateLead(
  id: string,
  form: Partial<LeadForm>,
): Promise<Lead> {
  const { data: current, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const payload = normalize(form)

  // Incrementare nr_contactari când sub_status devine nu_raspunde / de_revenit
  if (
    'sub_status' in form &&
    (form.sub_status === 'nu_raspunde' || form.sub_status === 'de_revenit') &&
    current.sub_status !== form.sub_status
  ) {
    const newNr = (current.nr_contactari ?? 0) + 1
    payload.nr_contactari = newNr
    payload.ultima_contactare_la = new Date().toISOString()
    // După 4 contactări fără răspuns → Nurture
    if (newNr >= 4) {
      payload.status = 'nurture'
      payload.sub_status = null
    }
  }

  // data_conversie la trecerea în convertit
  if (payload.status === 'convertit' && current.status !== 'convertit') {
    payload.data_conversie = new Date().toISOString()
  }

  // A 2-a neprezentare → nurture direct (fără SMS). resolveNoShow marchează deja
  // programarea absent și recalculează nr_neprezentari.
  if (payload.status === 'nu_a_venit' && current.status !== 'nu_a_venit') {
    const effective = await resolveNoShow(id)
    payload.status = effective
    if (effective === 'nurture') {
      payload.sub_status = null
      payload.flag_reminder = false
      payload.flag_streak = 0
      payload.flag_reminder_at = null
    }
  }

  // Flagul de prioritate se curăță la prima schimbare de status (primul drag).
  const statusChanging =
    payload.status != null && payload.status !== current.status
  if (statusChanging && current.flag_reminder) {
    payload.flag_reminder = false
    payload.flag_reminder_at = null
    payload.flag_streak = 0
  }
  // sub_status are sens doar în 'contactat' — se golește la ieșirea din coloană.
  if (
    statusChanging &&
    payload.status !== 'contactat' &&
    current.sub_status &&
    payload.sub_status === undefined
  ) {
    payload.sub_status = null
  }

  const { data, error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error

  if (statusChanging) await syncProgramarePrezenta(id, data.status)
  await triggerLeadSms(current.status, data)
  return data
}

export async function updateLeadStatus(
  id: string,
  status: StatusLead,
): Promise<Lead> {
  const { data: current, error: fetchError } = await supabase
    .from('leads')
    .select('status, flag_reminder')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  // A 2-a neprezentare → nurture direct (fără SMS). resolveNoShow marchează deja
  // programarea absent, deci nu mai apelăm syncProgramarePrezenta pe această cale.
  const effective = status === 'nu_a_venit' ? await resolveNoShow(id) : status

  const updates: UpdateDto<'leads'> = { status: effective }
  if (effective === 'convertit') {
    updates.data_conversie = new Date().toISOString()
  }
  // Flagul de prioritate se curăță la primul drag către altă coloană.
  if (current.flag_reminder || effective === 'nurture') {
    updates.flag_reminder = false
    updates.flag_reminder_at = null
    updates.flag_streak = 0
  }
  // sub_status are sens doar în 'contactat' — se golește la ieșire.
  if (effective !== 'contactat') {
    updates.sub_status = null
  }
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error

  if (status !== 'nu_a_venit') await syncProgramarePrezenta(id, effective)
  await triggerLeadSms(current.status, data)
  return data
}

export type LogContactInput = {
  leadId: string
  canal: CanalContact
  rezultat: RezultatContact
  observatii?: string
  dataCallback?: string // doar pentru follow_up (callback la o dată)
  // Pentru follow_up: ce sub-status capătă leadul. Implicit 'de_revenit'
  // (a răspuns, revine), dar poate fi 'nu_raspunde' (nu a răspuns, re-încercăm).
  subStatus?: SubStatusLead
}

// Butonul hibrid „Loghează contact": (1) inserează un rând în lead_contacte
// (sursa de adevăr pentru scorecard, atribuit operatorului curent), apoi
// (2) reflectă rezultatul în lead prin updateLead — care deja gestionează
// nr_contactari, sub_status, auto-nurture și triggerele SMS. Nu dublăm logica.
export async function logContact(input: LogContactInput): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error: insErr } = await supabase.from('lead_contacte').insert({
    lead_id: input.leadId,
    user_id: user?.id,
    canal: input.canal,
    rezultat: input.rezultat,
    observatii: input.observatii?.trim() || null,
  })
  if (insErr) throw insErr

  const { data: current } = await supabase
    .from('leads')
    .select('status, observatii')
    .eq('id', input.leadId)
    .single()

  const patch: Partial<LeadForm> = {}
  const eticheta =
    input.rezultat === 'reusit'
      ? 'Contact reușit'
      : input.rezultat === 'follow_up'
        ? input.subStatus === 'nu_raspunde'
          ? 'Nu răspunde'
          : 'Follow-up'
        : 'Pierdut'
  if (input.observatii?.trim()) {
    patch.observatii = prependObservatie(
      eticheta,
      input.observatii,
      current?.observatii ?? null,
    )
  }

  if (input.rezultat === 'follow_up') {
    patch.sub_status = input.subStatus ?? 'de_revenit'
    if (input.dataCallback) patch.data_callback_dorit = input.dataCallback
    if (current?.status === 'nou') patch.status = 'contactat'
  } else if (input.rezultat === 'pierdut') {
    patch.status = 'pierdut'
    if (input.observatii?.trim()) patch.motiv_pierdut = input.observatii.trim()
  } else {
    // reușit: contactul a răspuns — curățăm sub_status-ul „de revenit / nu răspunde"
    patch.sub_status = ''
    if (current?.status === 'nou') patch.status = 'contactat'
  }

  if (Object.keys(patch).length > 0) {
    await updateLead(input.leadId, patch)
  }
}
