# Integrare Meta Ads → Google Sheet → Qapp (fără API Meta)

Ocolește complet verificarea aplicației Meta. Lead-urile din Meta Ads ajung deja
în Google Sheet-ul **„Centralizator Leads 2025-2026"**, tab **„Formular Program de
vara 4-25+"**. Un Apps Script de pe sheet trimite rândurile noi către edge function-ul
`intake-sheets-lead`, care le bagă în kanban („Nou", sursă „Meta Ads"), cu dedup.

## Backlog (o singură dată, deja făcut)
- 472 lead-uri istorice importate: 90 recente → „Nou", 382 → Nurture.
- Dedup pe `metasheet:<id>` (id-ul liniei Meta) + pe telefon.

## Apps Script (pentru lead-urile noi de acum încolo)

În sheet: **Extensions → Apps Script**, șterge tot, lipește codul de mai jos,
**Save**, apoi rulează o dată `setup` (creează triggerul la 10 min) și autorizează.

```javascript
const ENDPOINT = 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-sheets-lead'
const SECRET = 'PUNE_AICI_SECRETUL' // = SHEETS_INTAKE_SECRET (din Supabase secrets). NU comite valoarea reala in git.
const TAB = 'Formular Program de vara 4-25+'

// Rulează o dată manual: creează triggerul recurent + marchează backlogul ca procesat.
function setup() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB)
  PropertiesService.getScriptProperties().setProperty('lastRow', String(sh.getLastRow()))
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('syncNewLeads').timeBased().everyMinutes(10).create()
  Logger.log('Setup gata. Backlog marcat la randul ' + sh.getLastRow())
}

function syncNewLeads() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB)
  const props = PropertiesService.getScriptProperties()
  const last = parseInt(props.getProperty('lastRow') || '1', 10)
  const now = sh.getLastRow()
  if (now <= last) return

  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String)
  const col = (name) => header.findIndex(h => h.toLowerCase().trim() === name)
  const data = sh.getRange(last + 1, 1, now - last, sh.getLastColumn()).getValues()

  const rows = data.map(r => {
    const cells = r.map(x => (x == null ? '' : String(x).trim()))
    // email/telefon prin continut (robust la ordinea coloanelor)
    let email = cells.find(x => x.indexOf('@') > -1) || ''
    let phone = cells.find(x => x.indexOf('p:') === 0) || ''
    const get = (n) => { const i = col(n); return i > -1 ? cells[i] : '' }
    return {
      id: get('id') || ('row:' + (last + 1)),
      created: get('created_time'),
      nume: get('full name'),
      prenume: get('nume_participant'),
      email: email || get('email'),
      phone: phone || get('phone'),
      varsta: get('vârstă_participant'),
      locatie: get('ce_locație_preferi?'),
      campaign: get('campaign_name'),
      ad_name: get('ad_name'),
      platform: get('platform'),
    }
  })

  const res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sheets-secret': SECRET },
    payload: JSON.stringify({ rows: rows }), // status omis => „nou"
    muteHttpExceptions: true,
  })
  Logger.log('Trimis ' + rows.length + ' randuri -> ' + res.getContentText())
  props.setProperty('lastRow', String(now))
}
```

## Verificare
- După `setup`, adaugă manual un rând de test în tab (cu un telefon valid) sau
  așteaptă un lead real → în max 10 min apare în /leads „Nou".
- Dedup garantat: re-rularea nu dublează (marker `metasheet:`).

## Note
- Secretul `SHEETS_INTAKE_SECRET` e setat ca secret Supabase; dacă se schimbă,
  actualizează și `SECRET` din script.
- Maparea coloanelor e pe **nume de antet** + fallback pe conținut (email=`@`,
  telefon=`p:`), deci rezistă la reordonări minore.
