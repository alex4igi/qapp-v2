# Integrare Meta Ads → Google Sheet → Qapp (fără API Meta)

Ocolește complet verificarea aplicației Meta (tech-provider). Lead-urile din Meta
Ads ajung deja în Google Sheet-ul **„Centralizator Leads 2025-2026"**, tab
**„Formular Program de vara 4-25+"**. Un Apps Script de pe sheet trimite rândurile
către edge function-ul `intake-sheets-lead`, care le bagă în kanban („Nou", sursă
„Meta Ads"), cu dedup.

## De ce „trimite tot setul", nu doar rândurile noi

Conectorul Meta **nu adaugă lead-urile la coada** sheet-ului — le reordonează
(sortare pe dată, pe blocuri de formular), iar numărul de rânduri poate chiar
scădea. Deci o logică „citește ce e sub ultimul rând procesat" (watermark) ratează
lead-urile noi. Soluția robustă: scriptul trimite **toate** rândurile la fiecare
rulare, iar endpoint-ul face **dedup în masă** pe `metasheet:<id>` (id-ul liniei
Meta) + pe telefon. Re-trimiterea e ieftină (o singură interogare de dedup) și
sigură — doar lead-urile cu adevărat noi se creează.

## Backlog (o singură dată, deja făcut)
- ~476 lead-uri istorice importate; cele recente → „Nou", restul → Nurture.

## Apps Script

În sheet: **Extensions → Apps Script**, șterge tot, lipește codul de mai jos,
pune secretul, **Save**, rulează `setup` (creează triggerul la 15 min) și apoi
`syncLeads` o dată (prima sincronizare + autorizare).

> ATENTIE la copiere între PC-uri: foloseste doar ghilimele drepte ('). Cel mai
> sigur, copiaza din fisierul text simplu pus in Drive (link dat in chat), nu din
> chat/markdown (acolo ghilimelele pot deveni curbate → syntax error).

```javascript
var ENDPOINT = 'https://cbftxkwvoboqahzsldcp.supabase.co/functions/v1/intake-sheets-lead';
var SECRET = 'PUNE_SECRETUL_AICI'; // = SHEETS_INTAKE_SECRET (Supabase). NU comite valoarea reala.
var TAB = 'Formular Program de vara 4-25+';

function setup() {
  var trigs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trigs.length; i++) ScriptApp.deleteTrigger(trigs[i]);
  ScriptApp.newTrigger('syncLeads').timeBased().everyMinutes(15).create();
  Logger.log('Setup gata: trigger la 15 min. Ruleaza acum syncLeads o data.');
}

function syncLeads() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  function col(name) {
    for (var i = 0; i < header.length; i++) {
      if (String(header[i]).toLowerCase().indexOf(name) > -1) return i;
    }
    return -1;
  }
  var iId = col('id'), iCreated = col('created'), iFull = col('full name');
  var iPart = col('participant'), iCamp = col('campaign_name'), iAd = col('ad_name'), iPlat = col('platform');

  var data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  var rows = [];
  for (var r = 0; r < data.length; r++) {
    var c = [];
    for (var k = 0; k < data[r].length; k++) c.push(data[r][k] == null ? '' : String(data[r][k]).trim());
    var email = '', phone = '', locTxt = '';
    for (var j = 0; j < c.length; j++) {
      if (!email && c[j].indexOf('@') > -1) email = c[j];
      if (!phone && c[j].indexOf('p:') === 0) phone = c[j];
      var low = c[j].toLowerCase();
      if (!locTxt && (low.indexOf('tefan') > -1 || low.indexOf('nicolina') > -1 || low.indexOf('centru') > -1)) locTxt = c[j];
    }
    if (!email && !phone) continue;
    rows.push({
      id: iId > -1 ? c[iId] : '',
      created: iCreated > -1 ? c[iCreated] : '',
      nume: iFull > -1 ? c[iFull] : '',
      prenume: iPart > -1 ? c[iPart] : '',
      email: email,
      phone: phone,
      locatie: locTxt,
      campaign: iCamp > -1 ? c[iCamp] : '',
      ad_name: iAd > -1 ? c[iAd] : '',
      platform: iPlat > -1 ? c[iPlat] : ''
    });
  }
  if (!rows.length) return;

  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sheets-secret': SECRET },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true
  });
  Logger.log('Trimis ' + rows.length + ' -> ' + res.getContentText());
}
```

## Verificare
- După `setup` + `syncLeads`, logul (View → Logs) arată `Trimis N -> {created:X, skipped:Y}`.
  `skipped` mare + `created` mic e normal (majoritatea există deja).
- Un lead nou real apare în /leads „Nou" în max 15 min, sursă „Meta Ads".

## Note
- Secretul `SHEETS_INTAKE_SECRET` e setat ca secret Supabase; dacă se schimbă,
  actualizează și `SECRET` din script.
- Maparea: email/telefon/locație prin **conținut** (email=`@`, telefon=`p:`,
  locație=text), restul prin nume de antet. Rezistă la reordonări și la formele
  vechi de formular (rândurile vechi sunt oricum dedup-uite și sărite).
