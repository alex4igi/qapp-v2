/**
 * Import zilnic al deconturilor Netopia în Qapp.
 *
 * Rulează în Google Apps Script pe contul alex@quasardance.ro (cel care primește
 * emailurile „Detalii decontare netopia-payments.com BatchId: …”). O dată pe zi caută
 * emailurile noi, scoate din ele numărul raportului și îl trimite funcției
 * `netopia-decont-import` din Supabase, care descarcă raportul prin API-ul Netopia.
 * Emailurile importate primesc eticheta „qapp-decont”; cele care au dat eroare rămân
 * fără etichetă și se reîncearcă a doua zi.
 *
 * Instalare (o singură dată):
 *  1. script.google.com → Proiect nou → lipește tot fișierul ăsta.
 *  2. Setările proiectului (rotița) → Proprietăți script → adaugă
 *     DECONT_SECRET = conținutul fișierului ~/netopia-decont-secret.txt
 *  3. Alege funcția `instaleaza` din bara de sus → Rulează → acceptă permisiunile.
 *     Ea face primul import și programează rularea zilnică (în jur de 08:00).
 */

const URL_FUNCTIE = 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/netopia-decont-import'
const ETICHETA = 'qapp-decont'
const CAUTARE = 'from:contact@netopia.ro subject:"Detalii decontare" newer_than:90d -label:' + ETICHETA

function instaleaza() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'importaDeconturi')
    .forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('importaDeconturi').timeBased().everyDays(1).atHour(8).create()
  importaDeconturi()
}

function importaDeconturi() {
  const secret = PropertiesService.getScriptProperties().getProperty('DECONT_SECRET')
  if (!secret) throw new Error('Lipsește DECONT_SECRET din Proprietățile scriptului.')
  const eticheta = GmailApp.getUserLabelByName(ETICHETA) || GmailApp.createLabel(ETICHETA)

  const firePeRaport = {}
  GmailApp.search(CAUTARE, 0, 50).forEach((fir) => {
    fir.getMessages().forEach((m) => {
      const text = m.getPlainBody() + ' ' + m.getBody()
      const gasit = /api\/report\/(\d+)\/download/.exec(text) || /banktransfer\/download\/(\d+)/.exec(text)
      if (gasit) firePeRaport[gasit[1]] = fir
    })
  })

  const ids = Object.keys(firePeRaport)
  console.log('Rapoarte Netopia neimportate găsite în Gmail: ' + (ids.length ? ids.join(', ') : 'niciunul'))
  if (!ids.length) return

  const esuate = []
  for (let i = 0; i < ids.length; i += 20) {
    const bucata = ids.slice(i, i + 20)
    const raspuns = UrlFetchApp.fetch(URL_FUNCTIE, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-decont-secret': secret },
      payload: JSON.stringify({ reportIds: bucata.map(Number) }),
      muteHttpExceptions: true,
    })
    if (raspuns.getResponseCode() !== 200) {
      throw new Error('Qapp a răspuns ' + raspuns.getResponseCode() + ': ' + raspuns.getContentText())
    }
    const rezultate = JSON.parse(raspuns.getContentText()).rezultate || []
    rezultate.forEach((r) => {
      if (r.ok) {
        firePeRaport[String(r.reportId)].addLabel(eticheta)
        console.log('Importat raportul ' + r.reportId + ': lotul ' + r.loturi.join(', ') + ', ' + r.linii + ' linii')
      }
      else esuate.push('raportul ' + r.reportId + ': ' + r.eroare)
    })
  }
  // Eroarea aruncată ajunge la Google, care trimite pe email rezumatul rulărilor eșuate.
  if (esuate.length) throw new Error('Deconturi neimportate — ' + esuate.join(' | '))
}
