// Edge Function (cron zilnic): remindere pentru contracte nesemnate + expirare.
//
// - Un reminder, la 5 zile de la trimitere (`REMINDER_DAYS`, `reminder_count`).
//   Reminderul trimite ACELAȘI link ca prima trimitere (`linkSemnare`), deci
//   linkul din primul SMS rămâne bun până la expirare. „Retrimite link" ține loc
//   de reminder (contract-resend pune `reminder_count` la maxim).
// - Un singur mesaj pe familie: dacă mai multe contracte ale aceleiași familii au
//   reminderul în aceeași zi (doi copii, contract + act adițional), pleacă un SMS
//   cu toate linkurile, nu câte unul pe contract.
// - Peste `token_expira_la` → status 'expirat' + event. Gate-ul (dacă există)
//   rămâne 'trimis' — bulk send-ul îl poate retrimite (contractul expirat nu mai
//   contează ca activ în list_targets_campanie).
//
// Idempotent: praguri pe zile + reminder_count; apeluri repetate în aceeași zi
// nu dublează SMS-uri.
import { doarEmail, notificaContract, REMINDER_DAYS } from '../_shared/contractNotify.ts'
import { linkSemnare, logEvent, serviceClient } from '../_shared/contracte.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type DeAmintit = {
  id: string
  familieId: string
  clientId: string | null
  reminderCount: number
  prenume: string | null
  link: string
  zileRamase: number
  tip: string | null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  try {
    const admin = serviceClient()
    const now = Date.now()
    let expired = 0
    let reminded = 0
    let mesaje = 0

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

    // 2) remindere — întâi adunăm ce e scadent, apoi trimitem pe familie
    const { data: pending } = await admin
      .from('contracte')
      .select('id, familie_id, client_id, trimis_la, reminder_count, token_expira_la, contract_templates(tip)')
      .in('status', ['trimis', 'deschis'])
      .lt('reminder_count', REMINDER_DAYS.length)
    const scadente: DeAmintit[] = []
    for (const c of pending ?? []) {
      if (!c.trimis_la || !c.familie_id) continue
      const daysSince = (now - new Date(c.trimis_la).getTime()) / 86400_000
      if (daysSince < REMINDER_DAYS[c.reminder_count ?? 0]) continue

      let prenume: string | null = null
      if (c.client_id) {
        const { data: copil } = await admin
          .from('clienti')
          .select('prenume, nume')
          .eq('id', c.client_id)
          .single()
        prenume = copil?.prenume ?? copil?.nume ?? null
      }
      let link: string
      try {
        link = await linkSemnare(admin, c.id)
      } catch (e) {
        await logEvent(admin, c.id, 'eroare', { pas: 'reminder_link', mesaj_eroare: String(e) })
        continue
      }
      scadente.push({
        id: c.id,
        familieId: c.familie_id,
        clientId: c.client_id,
        reminderCount: c.reminder_count ?? 0,
        prenume,
        link,
        zileRamase: c.token_expira_la
          ? Math.max(1, Math.ceil((new Date(c.token_expira_la).getTime() - now) / 86400_000))
          : 7,
        tip: (c.contract_templates as unknown as { tip: string | null } | null)?.tip ?? null,
      })
    }

    // Cererea de reziliere pleacă doar pe email, deci nu intră în același mesaj cu contractele.
    const grupuri = new Map<string, DeAmintit[]>()
    for (const c of scadente) {
      const cheie = `${c.familieId}|${doarEmail(c.tip) ? 'email' : 'oricare'}`
      grupuri.set(cheie, [...(grupuri.get(cheie) ?? []), c])
    }

    for (const grup of grupuri.values()) {
      const { data: familie } = await admin
        .from('familii')
        .select('telefon, email')
        .eq('id', grup[0].familieId)
        .single()
      if (!familie?.telefon && !familie?.email) continue

      const acum = new Date().toISOString()
      for (const c of grup) {
        await admin
          .from('contracte')
          .update({ reminder_count: c.reminderCount + 1, last_reminder_la: acum })
          .eq('id', c.id)
      }

      const [primul, ...alte] = grup
      const notif = await notificaContract(admin, {
        contractId: primul.id,
        alte: alte.map((c) => ({ contractId: c.id, clientId: c.clientId })),
        telefon: familie.telefon,
        email: familie.email,
        clientId: primul.clientId,
        codMesaj: 'contract_reminder',
        doarEmail: doarEmail(primul.tip),
        ...mesajReminder(grup),
      })
      for (const c of grup) {
        await logEvent(admin, c.id, 'reminder', {
          nr: c.reminderCount + 1,
          canal: notif.canal,
          trimis: notif.ok,
          ...(grup.length > 1 ? { grupat_cu: grup.length - 1 } : {}),
        })
      }
      reminded += grup.length
      mesaje++
    }

    return json({ ok: true, expired, reminded, mesaje })
  } catch (e) {
    console.error('process-contract-reminders error:', e)
    return json({ error: String(e) }, 500)
  }
})

// SMS fără diacritice (regulă casă).
function mesajReminder(grup: DeAmintit[]): { smsText: string; emailSubject: string; emailHtml: string } {
  const zile = Math.min(...grup.map((c) => c.zileRamase))
  const cerere = doarEmail(grup[0].tip)

  if (grup.length === 1) {
    const c = grup[0]
    const cine = c.prenume ? ` pentru ${c.prenume}` : ''
    const doc = cerere ? 'Cererea de reziliere' : 'Contractul'
    return {
      smsText: cerere
        ? `Buna ziua! Cererea de reziliere${cine} nu este inca semnata. O puteti completa si semna aici: ${c.link}. Linkul mai este valabil ${zile} zile.`
        : `Buna ziua! Contractul${cine} nu este inca semnat. Il puteti verifica si semna aici: ${c.link}. Linkul mai este valabil ${zile} zile.`,
      emailSubject: `Quasar Dance — reminder ${cerere ? 'cerere de reziliere' : 'contract'} de semnat${cine}`,
      emailHtml:
        `<p>Bună ziua,</p><p>${doc}${cine} așteaptă încă semnătura dumneavoastră. ` +
        `Deschideți linkul de mai jos, verificați datele și semnați:</p>` +
        `<p><a href="${c.link}">${c.link}</a></p>` +
        `<p>Linkul este valabil ${zile} zile.</p><p>Quasar Dance</p>`,
    }
  }

  const docs = cerere ? 'cereri de reziliere' : 'contracte'
  // Același copil cu contract + act adițional: numele singur nu le deosebește.
  const nume = grup.map((c) => c.prenume)
  const eticheta = (c: DeAmintit, i: number) =>
    c.prenume && nume.indexOf(c.prenume) === nume.lastIndexOf(c.prenume)
      ? c.prenume
      : `${c.prenume ?? (cerere ? 'cererea' : 'contractul')} ${i + 1}`
  return {
    smsText:
      `Buna ziua! Aveti ${grup.length} ${docs} nesemnate. Le puteti semna aici: ` +
      grup.map((c, i) => `${eticheta(c, i)}: ${c.link}`).join(' ; ') +
      `. Linkurile mai sunt valabile ${zile} zile.`,
    emailSubject: `Quasar Dance — reminder: ${grup.length} ${docs} de semnat`,
    emailHtml:
      `<p>Bună ziua,</p><p>Aveți ${grup.length} ${docs} care așteaptă încă semnătura dumneavoastră. ` +
      `Deschideți fiecare link, verificați datele și semnați:</p><ul>` +
      grup.map((c, i) => `<li>${eticheta(c, i)}: <a href="${c.link}">${c.link}</a></li>`).join('') +
      `</ul><p>Linkurile sunt valabile ${zile} zile.</p><p>Quasar Dance</p>`,
  }
}
