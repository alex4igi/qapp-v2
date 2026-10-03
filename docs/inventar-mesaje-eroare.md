# Inventar mesaje de eroare (3 oct. 2026)

Scop: fiecare mesaj de eroare să spună **de ce** nu merge și **ce poți face în loc**
(modelul bun: „Înrolarea are încasări — folosește Mută sau Reziliază.").

Toate punctele de mai jos sunt **propunere** până le confirmă Alex.

## Ce am verificat

| Sursă | Câte | Unde ajung |
|---|---|---|
| `raise exception` în funcțiile live din DB | 333 mesaje distincte, 153 funcții | trec direct în UI prin `humanizeError` (cod P0001) |
| Constrângeri DB (chei străine, unicitate, verificări, suprapuneri) | 26 FK care blochează ștergerea · 64 unicitate · 182 verificări · 4 suprapuneri | **un singur mesaj generic pe tip** în `src/lib/errorMessage.ts` |
| Validări din formulare (`setError` / `throw new Error`) | ~190 | în general clare: „X e obligatoriu", „Alege Y" — nimic de reparat |
| Funcții edge | ~190 de răspunsuri de eroare | depinde de cum le cheamă aplicația (vezi §3) |

Cazul pornit de Alex (ștergerea unei înrolări cu încasări) e deja bine: `sterge_inrolare` răspunde
„Înrolarea are încasări — folosește Mută sau Reziliază."

## 1. „Cere unui manager" — dar managerul primește același refuz

Șase mesaje trimit recepția la manager, dar verificarea din DB nu ține cont de rol: managerul
lovește exact același zid. Omul pierde timp și ajunge tot la zero.

| Funcție | Mesaj azi | Ce poate face de fapt managerul | Text propus |
|---|---|---|---|
| `muta_incasare_la_alt_client` | Plățile online (Netopia)… nu se mută de aici. Cere unui manager. | să șteargă plata cu motiv și s-o reîncaseze la clientul corect (factura Netopia rămâne la familia care a plătit) | „Plățile online nu se mută: au factură automată pe familia care a plătit. Dacă banii sunt pentru alt copil din aceeași familie, un manager poate șterge plata cu motiv și o reîncasează pe luna corectă." |
| idem | Pentru plata asta există deja factură FGO… Cere unui manager. | să storneze factura în FGO, apoi ștergere + reîncasare | „…Pașii: 1) stornezi factura în FGO, 2) un manager șterge plata cu motiv, 3) o încasezi din nou la clientul corect." |
| idem | Luna face parte dintr-o plată integrală de sezon (−5%) — nu se mută. Cere unui manager. | nimic din aplicație | ⚠️ **de decis**: ce facem cu o plată integrală pusă greșit? Până atunci: „…nu se mută (ar strica reducerea pe tot sezonul). Scrie-i lui Alex." |
| idem | Plata (X RON) e mai mare decât restul… Alege altă lună sau cere unui manager. | nimic diferit | „…Alege o lună cu rest de plată cel puțin X RON, sau mută plata pe bucăți după ce un manager o împarte." ⚠️ nu există „împarte plata" — de decis |
| `corecteaza_data_inrolare` | Înrolarea are N rezervări OPEN active pe alte zile — cere unui manager. | nimic diferit | „…Anulează rezervările OPEN din fișa clientului, corectează data, apoi rezervă din nou." |
| `muta_inrolare_curs` | Înrolarea are N rezervări OPEN active — cere unui manager. | nimic diferit | „…Anulează rezervările OPEN, mută înrolarea, apoi rezervă pe grupa nouă." |

Variantă alternativă la ultimele două: lăsăm managerul să treacă (verificare pe rol). E o decizie
de regulă, nu de text.

## 2. Erori de suprapunere care apar în engleză

Codul `23505`/`23503`/`23514` e tradus, `23P01` (interval suprapus) **nu**. Ecranul de închirieri îl
prinde separat; celelalte trei afișează textul brut Postgres, de tipul
*„conflicting key value violates exclusion constraint …"*:

| Constrângere | Unde apare | Text propus |
|---|---|---|
| `kpi_grile_fara_suprapunere` | /grile-kpi, atribuire grilă | „Omul are deja o grilă activă în perioada asta. Închide-o pe cea veche (Valabil până la) înainte să atribui una nouă." |
| `manageri_locatii_fara_suprapunere` | salarizare manager, alocare locație | „Locația are deja un manager în perioada asta. Închide perioada celui vechi întâi." |
| `salarizare_receptie_fara_suprapunere` | grila recepției | „Omul are deja o grilă de recepție în perioada asta. Închide-o pe cea veche întâi." |

## 3. Funcții edge al căror mesaj se pierde

`src/lib/invokeEdge.ts` citește motivul real din răspuns. Patru locuri cheamă direct
`supabase.functions.invoke` și, la un refuz (400/403/500), afișează doar
*„Edge Function returned a non-2xx status code"*:

| Fișier | Funcție edge | Mesaje pierdute azi (exemple) |
|---|---|---|
| `src/features/setari/utilizatoriApi.ts` | `admin-users` | „nu poți șterge ultimul cont owner", „cont la altă locație", „nu poți promova la rolul …" |
| `src/features/teacheri/api.ts` (`createTeacherAccount`) | `admin-users` | „instructorul e deja legat de alt cont — dezleagă-l întâi". Codul încearcă să citească motivul, dar îl caută în locul greșit. |
| `src/features/facturare/api.ts` | `autofgo` | „liniile trebuie să aibă articol și sumă", erorile FGO (500) |
| `src/features/notificari-sms/api.ts` | `process-sms-queue` | orice eroare de trimitere |

Reparația: toate patru trec pe `invokeEdge`. E o reparație mecanică.
Unele texte de aici sunt scrise ca note interne („userId obligatoriu", „rol invalid"). Le
rescriem doar pe cele pe care le poate vedea un om: cele despre conturi și locații.

## 4. Mesajele generice ale constrângerilor

Azi, orice cheie străină, valoare duplicată sau verificare eșuată primește același text, fără
să spună **ce** date sunt legate sau **ce** valoare e greșită. Propunere: în `errorMessage.ts`, o hartă
**pe numele constrângerii** (Postgres îl trimite în mesaj). Constrângerile pe care nu le trecem în hartă
rămân pe textul generic.

**Ștergeri blocate** (azi: „Operația nu se poate face: există date asociate."):

| Ce ștergi | Ce o blochează | Text propus |
|---|---|---|
| Sală (Setări) | închirieri pe sala respectivă (`inchirieri_sala_fkey`) | „Sala are închirieri în istoric și nu se poate șterge. Dezactiveaz-o." ⚠️ verific că există „dezactivează" |
| Locație (Setări) | absențe 21z, capacitate, manageri, preînscrieri | „Locația are istoric (manageri, capacitate, preînscrieri) și nu se poate șterge." |
| Voucher | comenzi Netopia cu el | „Voucherul a fost folosit la o plată online. Expiră-l (Valabil până la) în loc să-l ștergi." |
| Eveniment | comenzi Netopia (bilete) | „Evenimentul are bilete vândute online. Anulează-l în loc să-l ștergi." |
| Sezon | campanie de recomandări legată | „Sezonul are o campanie de recomandări. Șterge sau mută campania întâi." |

**Duplicate** (azi: „Există deja o înregistrare cu aceste date."), cele pe care le poate lovi staff-ul:

| Constrângere | Text propus |
|---|---|
| `uq_enrollment_client_curs_data` | „Clientul are deja o înrolare pe acest curs care începe în aceeași zi. Deschide tabul Înrolări din fișa lui." |
| `sezoane_unique_activ` / `sezoane_unique_stare_activ` | „Poate fi activ un singur sezon. Arhivează-l pe cel curent întâi." |
| `cursuri_suspendari_deschisa_unica` | „Grupa e deja suspendată. Reactiveaz-o întâi, apoi pune o suspendare nouă." |
| `evenimente_participanti_eveniment_client_key` | „Cursantul e deja înscris la eveniment." |
| `spectacol_act_performeri_act_client_key` | „Cursantul e deja în acest act." |
| `unitati_invatamant_norm_uniq` | „Școala există deja în catalog. Alege-o din listă." |
| `reconcilieri_cash_data_locatie_key` | „Reconcilierea pentru ziua și locația asta există deja. Deschide-o pe aceea." |
| `campanii_*_nume_key`, `motive_abandon_eticheta_key` | „Există deja una cu numele ăsta. Alege alt nume." |
| `tarife_inchiriere_sala_tier_key`, `salarizare_grila_post_valabil_de_la_key` | „Există deja un tarif/grilă pentru asta. Edit-o pe cea existentă." |

**Verificări** (azi: „O valoare nu respectă regulile (verificare eșuată)."): 182 de constrângeri, majoritatea
prinse deja de formulare. Le traducem doar pe cele care ajung la utilizator, de exemplu
`inchirieri_durata_min_check` („Durata trebuie să fie din 30 în 30 de minute"),
`vouchere_interval_valid` („Data de început trebuie să fie înaintea datei de expirare"),
`evenimente_grupa_are_data` („Un eveniment de grupă are nevoie de o dată").

## 5. Mesaje tehnice sau în engleză din funcțiile DB

| Mesaj | Funcții | Text propus |
|---|---|---|
| `Access denied` | 8 (pontaj, absențe 21z, evaluări, cron) | „Acces refuzat." (ca celelalte) |
| `Not authenticated` | 5 | „Sesiunea a expirat. Intră din nou în cont." |
| `forbidden: doar recepția+ poate …` / `forbidden: doar managerul+ …` | 6 | fără „forbidden:" și „+": „Doar recepția și managerii pot muta înrolări între cursuri." |
| `data_final nu poate fi înainte de data_incepere.` | `clone_sezon`, `create_campanie_reinscriere` | „Data de final nu poate fi înaintea datei de început." |
| `Cursul nu are preț promo configurat (pret_lunar_promo).` | `activate_reinscriere` | „Cursul nu are „Preț lunar PROMO". Setează-l în fișa cursului." |
| `Abonamentul/Înrolarea nu are lună (data_incepere).` | 3 | „Înrolarea nu are dată de început. Corectează data din fișa clientului." |
| `Tip țintă invalid: %`, `p_entity trebuie să fie …`, `Acțiune invalidă: %`, `KPI auto fără implementare`, `Post necunoscut: %` | 7 | erori de programare, nu le vede omul în mod normal. Rămân, dar primesc în față „Eroare internă — anunță-l pe Alex:" |

## 6. Refuzuri de rol care nu spun cine poate

„Acces refuzat." (52 funcții), „Acces interzis" (9), „forbidden" (6). Sunt mai ales garduri pentru
portal și agenție: cineva din staff le vede doar dacă butonul e vizibil pentru un rol care n-are voie
(un caz deja întâmplat cu contract-send). **Prioritate mică.** Când apare un caz, mesajul spune
rolurile care pot: „Doar managerii și adminii pot face asta."

## 7. Mesaje corecte, dar fără pas următor

| Mesaj | Funcție | Sugestie de adăugat |
|---|---|---|
| Înrolarea e reziliată — nu se mai mută. | `muta_inrolare_curs` | „Fă o înrolare nouă pe grupa nouă." |
| Înrolarea e reziliată — data nu se mai corectează. | `corecteaza_data_inrolare` | „Dacă reziliere a fost o greșeală, cere unui manager s-o anuleze." ⚠️ verific că există anularea rezilierii |
| Clientul are deja o înrolare pe acest curs în luna țintă. | `corecteaza_data_inrolare` | „Șterge sau mută dublura întâi (tabul Înrolări)." |
| Clientul are deja o familie. | `creeaza_familie_proprie` | „Contractul se trimite pe familia existentă." |
| Clientul nu are nici telefon, nici email… | `creeaza_familie_proprie` | „Completează telefonul în fișa clientului." |
| Sesiune completă (X / Y). Nu mai sunt locuri. | `rezerva_loc_open` | (staff) „Mărește limita din fișa cursului → OPEN." |
| Ședința din … e completă (X / Y). | `muta_inrolare_curs`, `corecteaza_data_inrolare` | idem |
| Grupa este suspendată în luna … | 4 funcții | „Alege altă lună sau reactivează grupa din fișa cursului." |
| Cursul nu este facultativ — rezervările OPEN sunt doar pe cursuri facultative. | `rezerva_loc_open` | „Pentru o grupă recurentă folosește Înrolare nouă." |
| Există deja un abonament activ pe luna respectivă. | `converteste_sedinte_in_abonament` | „Ședințele se pot muta ca avans pe abonamentul existent." ⚠️ de verificat dacă e adevărat |
| Doar manager+ poate șterge înrolări. | `sterge_inrolare` | „Doar managerii pot șterge înrolări. Poți Rezilia sau Muta." |
| Voucherul nu se combină cu prețul de reînscriere… | trigger | „Scoate voucherul sau debifează prețul de reînscriere." |
| Nu există grilă de salarizare „X" valabilă în … | `_salarizare_parametri` | „Adaug-o în Salarizare → Grile." |
| Încasarea nu există. / Înrolarea nu există. | 10 funcții | „…probabil a fost ștearsă între timp. Reîncarcă pagina." |
| Cursul nu poate fi șters: are % . Arhivează-l… | `delete_curs_safe`, `delete_teacher_safe` | doar spațiul în plus înainte de punct |

## 8. Portal (părinți)

Câteva mesaje din `submit_rating_client` / `submit_app_feedback_portal` sunt fără diacritice și cu
literă mică („ai nevoie de minim 3 luni achitate consecutiv la aceasta grupa (ai %)", „rating invalid").
Portalul le afișează așa cum sunt. Le aducem la forma celorlalte; textele tehnice („rating invalid",
„context invalid") nu ar trebui să ajungă la părinte, pentru că le oprește interfața înainte.

## 9. Butoane care „nu fac nimic": eroarea nu se afișează nicăieri

**Cazul din 3 oct.:** din datele de utilizare, rolul manager a apăsat azi „Confirmă ștergerea înrolării ›
Șterge înrolarea" de **7 ori**, iar `audit_log` are doar **3** `enrollment_deleted` (pe 1 și 2 oct.:
4/4 și 1/1). Cauza: mutația `stergeInrolare` (`ClientProfilePage/index.tsx`) nu are `onError`, iar
`ConfirmDeleteInrolareModal` nu are unde afișa o eroare. Orice refuz dispare în tăcere și butonul pare
că nu face nimic. Cauze probabile ale refuzurilor:
- **motivul e gol**: butonul e activ, aplicația aruncă „Motivul e obligatoriu.", iar mesajul nu apare;
- **dublu-clic**: al doilea apel caută o înrolare deja ștearsă și eșuează, tot în tăcere.

Am verificat și varianta „fereastra arată 0 încasat, serverul vede bani": azi nu există niciun caz.

**Cauza generală:** `MutationCache` din `src/main.tsx` are doar `onSuccess` (reîmprospătare), fără
`onError`. Din 202 `useMutation`, **28** nu au `onError` și nici nu afișează `.error`. Pentru toate
28, un refuz arată exact la fel ca un clic fără efect:

| Unde | Acțiune |
|---|---|
| Fișa clientului | **Reziliază**, **Șterge înrolarea**, Șterge document |
| Fișa cursului | Activează reînscrierea, Anulează sesiune OPEN |
| Roster eveniment | Adaugă / scoate participant, scoate de la demo, prezență |
| Prezențe (`/prezente`) | marcarea prezenței |
| Setări → Sezoane | Activează sezon, Șterge vacanță |
| Facturare | Re-emite (Clienți), Reîncearcă (Portal) |
| Reînscrieri | Închide campania |
| Leads | Reactivează (fișă + banner nurture) |
| Opt-out | marchează / scoate / revino |
| Salarizare | corecție pool capacitate |
| Evaluări grupă | reactivează |
| Spectacole | reordonează |
| Notificări / anunțuri | citit, rezolvă, digest |

**✅ Făcut 3 oct. (confirmat de Alex):**
1. O plasă globală: `MutationCache.onError` afișează un mesaj (`humanizeError`) pentru orice
   mutație care nu-și tratează singură eroarea. Repară toate cele 28 dintr-un loc, inclusiv cele viitoare.
2. „Șterge înrolarea": butonul rămâne inactiv cât timp motivul e gol, iar eroarea apare în fereastră
   (la fel la „Reziliază").

## Ordinea propusă

0. ~~**§9** plasa globală pentru erori + fereastra „Șterge înrolarea"~~ ✅ 3 oct.
1. **§3** funcțiile edge pe `invokeEdge`: reparație mecanică, fără risc.
2. **§2** traducerea erorilor de suprapunere (`23P01`) + **§4** harta pe numele constrângerii în
   `errorMessage.ts`: un singur fișier, fără migrație.
3. **§1** cele șase mesaje „cere unui manager": două decizii de la Alex (plata integrală, plata prea mare).
4. **§5 + §7** textele din funcțiile DB: o migrație care rescrie doar mesajele (`create or replace`
   pe funcțiile atinse, fără schimbare de logică).
5. **§6 + §8** când apar.

## Cum se regenerează lista din DB

```sql
with m as (
  select distinct p.proname,
    (regexp_matches(p.prosrc, 'raise\s+exception\s+''((?:[^'']|'''')*)''', 'gi'))[1] as msg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select msg, string_agg(proname, ', ' order by proname) as functii, count(*)
from m group by msg order by count(*) desc, msg;
```

Interogarea nu prinde mesajele construite la rulare (`raise exception '%', v_msg`), de exemplu în
`trg_enrollment_voucher_valid`, `rezerva_loc_open`, `incaseaza_plata_integrala_sezon`.
