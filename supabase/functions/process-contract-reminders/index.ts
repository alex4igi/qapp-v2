// Edge Function (cron zilnic): remindere pentru contracte nesemnate + expirare.
//
// - Reminder la 3 zile și la 7 zile de la trimitere (max 2, `reminder_count`).
//   Tokenul e ROTIT la fiecare reminder (stocăm doar hash-ul, nu putem reconstrui
//   linkul vechi) — linkul vechi devine invalid, cel nou are aceeași expirare.
// - Peste `token_expira_la` → status 'expirat' + event. Gate-ul (dacă există)
//   rămâne 'trimis' — bulk send-ul îl poate retrimite (contractul expirat nu mai
//   contează ca activ în list_targets_campanie).
//
// Idempotent: praguri pe zile + reminder_count; apeluri repetate în aceeași zi
// nu dublează SMS-uri.
import { notificaContract } from '../_shared/contractNotify.ts'
import { logEvent, portalUrl, randomToken, serviceClient, sha256Hex } from '../_shared/contracte.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const REMINDER_DAYS = [3, 7]

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const admin = serviceClient()
    const now = Date.now()
    let expired = 0
    let reminded = 0

    // 1) expirare
    const { data: toExpire } = await admin
      .from('contracte')
      .select('id')
      .in('status', ['trimis', 'deschis'])
      .lt('token_expira_la', new Date(now).toISOString())
    for (const c of toExpire ?? []) {
      await admin.from('contracte').update({ status: 'expirat' }).eq('id', c.id)
      await logEvent(admin, c.id, 'expirat', { la: 'cron' })
      expired++
    }

    // 2) remindere
    const { data: pending } = await admin
      .from('contracte')
      .select('id, familie_id, client_id, trimis_la, reminder_count, token_expira_la, contract_templates(nume, valabilitate_zile)')
      .in('status', ['trimis', 'deschis'])
      .lt('reminder_count', REMINDER_DAYS.length)
    for (const c of pending ?? []) {
      if (!c.trimis_la) continue
      const daysSince = (now - new Date(c.trimis_la).getTime()) / 86400_000
      const threshold = REMINDER_DAYS[c.reminder_count ?? 0]
      if (daysSince < threshold) continue

      const { data: familie } = await admin
        .from('familii')
        .select('telefon, email')
        .eq('id', c.familie_id)
        .single()
      // Fără canal nu rotim tokenul degeaba (rotirea ar omorî linkul deja trimis).
      if (!familie?.telefon && !familie?.email) continue

      let prenume: string | null = null
      if (c.client_id) {
        const { data: copil } = await admin
          .from('clienti')
          .select('prenume, nume')
          .eq('id', c.client_id)
          .single()
        prenume = copil?.prenume ?? copil?.nume ?? null
      }

      // rotire token: linkul vechi moare, cel nou păstrează expirarea
      const token = randomToken()
      await admin
        .from('contracte')
        .update({
          token_hash: await sha256Hex(token),
          reminder_count: (c.reminder_count ?? 0) + 1,
          last_reminder_la: new Date().toISOString(),
        })
        .eq('id', c.id)

      const cine = prenume ? ` pentru ${prenume}` : ''
      const zileRamase = c.token_expira_la
        ? Math.max(1, Math.ceil((new Date(c.token_expira_la).getTime() - now) / 86400_000))
        : 7
      const link = `${portalUrl()}/s/${token}`
      const mesaj =
        `Quasar Dance: reminder - contractul${cine} asteapta semnatura ta: ${link} (mai e valabil ${zileRamase} zile)`

      // Un singur canal, ca la prima trimitere: SMS dacă are telefon, altfel email.
      const notif = await notificaContract(admin, {
        contractId: c.id,
        telefon: familie.telefon,
        email: familie.email,
        clientId: c.client_id,
        codMesaj: 'contract_reminder',
        smsText: mesaj,
        emailSubject: `Quasar Dance — reminder contract de semnat${cine}`,
        emailHtml:
          `<p>Bună ziua,</p><p>Contractul${cine} așteaptă încă semnătura dumneavoastră. ` +
          `Deschideți linkul de mai jos, verificați datele și semnați:</p>` +
          `<p><a href="${link}">${link}</a></p>` +
          `<p>Linkul este valabil ${zileRamase} zile.</p><p>Quasar Dance</p>`,
      })
      await logEvent(admin, c.id, 'reminder', {
        nr: (c.reminder_count ?? 0) + 1,
        canal: notif.canal,
        trimis: notif.ok,
      })
      reminded++
    }

    return json({ ok: true, expired, reminded })
  } catch (e) {
    console.error('process-contract-reminders error:', e)
    return json({ error: String(e) }, 500)
  }
})
