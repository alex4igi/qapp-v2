// Notificarea familiei despre un contract de semnat — UN SINGUR CANAL per familie:
// SMS dacă are telefon, email doar ca rezervă. (Decis 2026-09-10.)
//
// De ce un singur canal: familia semnează dintr-un mesaj și primește degeaba
// celălalt — dublu cost pe mesaj, fără câștig.
//
// De ce SMS-ul pleacă DIRECT și nu prin coada `situatie_sms_uri`: coada aia se
// golește doar când apasă cineva „Trimite cele de trimis" în /notificari-sms, iar
// după o trimitere de contract nimeni nu apasă. Așa au stat 95 de SMS-uri de
// contract pe „De trimis" între 31 aug și 10 sept 2026, dintre care 17 familii fără
// email n-au aflat niciodată că au un contract de semnat. Rândul din
// `situatie_sms_uri` se scrie în continuare, dar cu status FINAL, ca pagina să
// rămână jurnalul complet de SMS-uri.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail, sendSms } from './messaging.ts'
import {
  deferUntil,
  getQuietHoursConfig,
  isQuiet,
  localDateBucharest,
} from './quietHours.ts'
import { logEvent } from './contracte.ts'

export type NotificareContract = {
  contractId: string
  telefon: string | null
  email: string | null
  clientId?: string | null
  codMesaj: 'contract' | 'contract_reminder'
  smsText: string
  emailSubject: string
  emailHtml: string
}

export type RezultatNotificare = {
  canal: 'sms' | 'email' | 'niciunul'
  ok: boolean
  amanat?: boolean
  error?: string
}

// Mesajul „contract de semnat" — prima trimitere și „Retrimite link".
// SMS fără diacritice (regulă casă).
export function mesajContract(
  prenumeCopil: string | null,
  link: string,
  zile: number,
): Pick<NotificareContract, 'smsText' | 'emailSubject' | 'emailHtml'> {
  const cine = prenumeCopil ? ` pentru ${prenumeCopil}` : ''
  return {
    smsText:
      `Buna ziua! Contractul${cine} este pregatit pentru semnare. Va rugam sa verificati datele si sa il semnati aici: ${link}. Linkul este valabil ${zile} zile.`,
    emailSubject: `Quasar Dance — contract de semnat${cine}`,
    emailHtml:
      `<p>Bună ziua,</p><p>Contractul${cine} este pregătit pentru semnare. ` +
      `Deschideți linkul de mai jos, verificați datele și semnați:</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>Linkul este valabil ${zile} zile.</p><p>Quasar Dance</p>`,
  }
}

export async function notificaContract(
  admin: SupabaseClient,
  n: NotificareContract,
): Promise<RezultatNotificare> {
  if (n.telefon) return await prinSms(admin, n)
  if (n.email) return await prinEmail(admin, n)
  return { canal: 'niciunul', ok: false, error: 'familie fără telefon și email' }
}

async function prinSms(
  admin: SupabaseClient,
  n: NotificareContract,
): Promise<RezultatNotificare> {
  const now = new Date()
  const cfg = await getQuietHoursConfig(admin)
  const amanat = isQuiet(now, cfg)
  const sendAfter = amanat ? deferUntil(now, cfg) : null

  const { data: rand, error: randErr } = await admin
    .from('situatie_sms_uri')
    .insert({
      telefon: n.telefon,
      mesaj: n.smsText,
      cod_mesaj: n.codMesaj,
      clienti_vizati: n.clientId ? [n.clientId] : [],
      status: amanat ? 'Amanat' : 'In curs de trimitere',
      data_planificata: localDateBucharest(sendAfter ? new Date(sendAfter) : now),
    })
    .select('id')
    .single()
  if (randErr) console.error('[situatie_sms_uri] insert FAIL:', randErr.message)

  if (amanat) {
    // `sursa_id` = legătura prin care process-sms-amanate trece rândul pe 'Trimis'
    const { error } = await admin.from('sms_amanate').insert({
      telefon: n.telefon,
      mesaj: n.smsText,
      tip: n.codMesaj,
      send_after: sendAfter,
      sursa_id: rand?.id ?? null,
    })
    if (error) {
      await marcheaza(admin, rand?.id, 'Esuat')
      await logEvent(admin, n.contractId, 'eroare', {
        pas: 'sms_amanare',
        mesaj_eroare: error.message,
      })
      return { canal: 'sms', ok: false, error: error.message }
    }
    await logEvent(admin, n.contractId, 'sms_amanat', { pleaca_dupa: cfg.end })
    return { canal: 'sms', ok: true, amanat: true }
  }

  const res = await sendSms(n.telefon!, n.smsText)
  // Un stub (lipsă credențiale / allowlist de test) NU e o trimitere: dacă îl
  // marcăm 'Trimis' pierdem exact urma pe care o reparăm aici.
  const plecat = res.ok && !res.stub
  await marcheaza(admin, rand?.id, plecat ? 'Trimis' : 'Esuat')
  if (plecat) {
    await logEvent(admin, n.contractId, 'sms_trimis', { message_id: res.messageId ?? null })
  } else {
    await logEvent(admin, n.contractId, 'eroare', {
      pas: 'sms',
      stub: res.stub,
      mesaj_eroare: res.error ?? (res.stub ? 'trimitere stub, SMS-ul nu a plecat' : 'eroare necunoscută'),
    })
  }
  return { canal: 'sms', ok: plecat, error: res.error }
}

async function prinEmail(
  admin: SupabaseClient,
  n: NotificareContract,
): Promise<RezultatNotificare> {
  const res = await sendEmail({
    to: n.email!,
    subject: n.emailSubject,
    html: n.emailHtml,
  })
  const plecat = res.ok && !res.stub
  if (plecat) await logEvent(admin, n.contractId, 'email_trimis', {})
  else {
    await logEvent(admin, n.contractId, 'eroare', {
      pas: 'email',
      stub: res.stub,
      mesaj_eroare: res.error ?? (res.stub ? 'trimitere stub, emailul nu a plecat' : 'eroare necunoscută'),
    })
  }
  return { canal: 'email', ok: plecat, error: res.error }
}

async function marcheaza(
  admin: SupabaseClient,
  id: string | undefined,
  status: 'Trimis' | 'Esuat',
): Promise<void> {
  if (!id) return
  const patch: Record<string, string> = { status }
  if (status === 'Trimis') patch.data_trimitere = localDateBucharest(new Date())
  await admin.from('situatie_sms_uri').update(patch).eq('id', id)
}
