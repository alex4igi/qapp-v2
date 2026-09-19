# Procedura pe statusurile de leads

Sursa de adevăr pentru ce are de făcut recepția cu un lead și ce face aplicația singură.
Decizii Alex, **17 septembrie 2026**, cu „Nu a venit" rescris pe **19 septembrie 2026**.

Trei fețe ale aceluiași text, care nu au voie să se contrazică:

| Unde | Ce arată | De unde vine |
|---|---|---|
| Aplicație — tooltip pe card | „ce fac cu cardul ăsta, acum" | `actiuneCard()` din `src/features/leads/procedura.ts` |
| Aplicație — tooltip pe status + ℹ︎ pe coloană | procedura coloanei | `STATUS_PROCEDURA` din același fișier |
| Ghid public `/prezentari/leads-proces.html` | secțiunile „coloană cu coloană" | **generate** din același fișier, `npm run gen:ghid` |

**Dacă schimbi `procedura.ts`, rulează `npm run gen:ghid`.** `npm run gen:ghid -- --check` iese
cu 1 dacă ghidul a rămas în urmă. Restul ghidului (povestea Dianei, diagrama, SMS-urile) e scris de
mână și se actualizează manual.

**Regula de aur a textelor:** secțiunea „ce face aplicația" descrie doar ce face codul **acum**. Ce e
decis dar nelivrat stă mai jos, la [Decis, încă nelivrat](#decis-încă-nelivrat) — un text care promite
recepției o alertă inexistentă e mai rău decât lipsa textului.

## Varianta scurtă (de transmis echipei)

> 1. **Nou** — sunat în aceeași zi. Intrat până la 18:00 → azi; seara → a doua zi până la 12:00.
> 2. **Nu răspunde** — 3 încercări în 5 zile: azi, mâine la altă oră, apoi peste 2–3 zile.
> 3. **De revenit** — sună-l fix în ziua pe care a cerut-o el.
> 4. Un lead „Contactat" are **mereu** un sub-status și o dată. Ați vorbit și nu s-a stabilit nimic ⇒ alege ceva.
> 5. **Waiting List** = doar „nu e loc". „Vreau, dar nu acum" → Contactat / De revenit, cu dată.
> 6. **Programat** — recepția bifează prezența în ziua ședinței. Nebifat ⇒ îl sunăm degeaba peste două zile.
> 7. **A venit** — discuția de după clasă e pasul care aduce înscrierea, nu SMS-ul.
> 8. **Nu a venit** — **îl suni la 2 zile de la absență**; dacă a lipsit joi sau vineri, luni. Nu răspunde ⇒ aceeași cadență de 3 încercări.
> 9. **Pierdut = nu mai contactăm niciodată.** Orice „nu acum" → **Nurture**.
>
> *Regula din spatele tuturor: un lead pleacă singur în Nurture doar când OMUL n-a răspuns, n-a venit
> sau nu s-a înscris. Când NOI n-am sunat, primește doar steguleț.*

## Mutarea cardului = contact

Constatare Alex, 18 septembrie 2026: *„dacă din Nou este mutat într-un fel sau altul, adică își
schimbă statusul, asta se face DOAR prin contact."* Datele confirmă: din 409 leaduri în pipeline,
**doar 4 n-au nicio urmă de om**, dar butonul 📞 fusese apăsat pe ~16%. Tot ce depindea de „ultimul
contact" — stegulețele de seară, pragurile spre Nurture, scorecardul — lucra pe date false.

De aceea **aplicația scrie singură contactul**, dintr-un trigger pe `leads`
(`20260918120000_contact_dedus_din_mutare.sql`), nu din UI: statusul se schimbă din drag & drop, din
fișa leadului, din stepper, din rosterul grupei și din RPC-uri (`inscrie_la_demo`).

- **Produc un contact dedus:** `contactat`, `programat`, `waiting_list`, `a_venit`, `convertit`, `pierdut`.
- **Nu produc:** `nu_a_venit` (o absență nu e un contact), `nurture`, `nou`.
- **Niciodată din cron:** joburile rulează pe `service_role`, unde `auth.uid()` e null.
- **Fără dubluri:** dacă s-a logat deja un contact pe acel lead în ultimele 5 minute, triggerul tace.
- Rândul e marcat `lead_contacte.dedus = true`, canal `necunoscut`.

Consecințe: `ultima_contactare_la` se actualizează singur (prin `bump_lead_ultima_contactare`) și
stegulețul se stinge. În scorecard (`20260918130000`), `contacte_logate` / `contacte_deduse` se văd
separat, iar **igiena notelor și detectorul de „rafală" rămân doar pe logările explicite** — nota pusă
de trigger nu e o notă, iar o mutare în bloc de carduri nu e o rafală de apeluri.

⚠️ **Fără backfill.** Contactele deduse există doar de la 18 septembrie 2026 încolo; scorecardul lunilor
anterioare rămâne cum era. Un backfill din `lead_history` ar rescrie retroactiv cifre legate de
evaluarea oamenilor — de decis separat.

Butonul 📞 rămâne necesar pentru ce nu se vede dintr-o mutare: **„am sunat și n-a răspuns"** și notițele.

## „Nu a venit" se sună (19 septembrie 2026)

Decizie Alex: **SMS-ul de neprezentare se înlocuiește cu un telefon.**

Ce era: o singură atingere — SMS-ul „ne pare rău că nu ai ajuns, dă-ne un mesaj la …", la 16:00 în
prima zi lucrătoare — după care procedura spunea explicit *„nu se sună"*, iar cardul cădea în Nurture
la 10 zile. Măsurat pe 19 sept.: **48 de carduri** în coloană, 46 cu SMS-ul trimis, **un singur apel
logat** pe toate 48. Regula chiar se respecta.

Ce a cântărit în decizie: **27% dintre ședințele demo se termină cu o neprezentare** (70 în
septembrie, din 262 de ședințe consumate; rata e constantă din iunie), iar din cele 129 de leaduri
care au trecut vreodată prin „Nu a venit", **16 au devenit până la urmă clienți (12%)** — fără ca
cineva să-i fi sunat, în medie la 46 de zile. E singurul status în care omul a arătat interes de
două ori: a lăsat datele **și** a acceptat o dată.

**Regula nouă:**

| | |
|---|---|
| Când sună recepția | la **2 zile** de la absență; dacă apelul ar pica sâmbătă sau duminică, **luni** |
| Dacă nu răspunde | **3 încercări în 5 zile**, ca la „Contactat" — a 3-a fără răspuns ⇒ Nurture |
| Dacă nu sună nimeni | cardul **rămâne** în coloană, cu steguleț care crește. Nesunat ⇒ nu pleacă în Nurture |
| Cele 10 zile → Nurture | rămân, dar **doar dacă s-a încercat măcar un apel** după absență |
| SMS | **niciunul**. Tipul `followup` a fost scos din cod (`_shared/sms.ts`, `send-lead-sms`, `cron-afternoon`) |

„La două zile, sau luni dacă absența e joi sau vineri" e, scris pe weekend, exact **+2 zile, iar dacă
pică în weekend, luni**: joi+2 = sâmbătă, vineri+2 = duminică. Formularea asta acoperă și absențele
de sâmbătă–duminică, zile în care se țin ședințe demo.

**Cum ajunge apelul în fața recepției.** Ziua apelului se **ștampilează în DB**, la intrarea în
status, de triggerul `lead_ziua_apelului` (`20260919140000`) — nu de fiecare apelant: în „Nu a venit"
se intră din `prune_expired_leads`, din `resolveNoShow`, din drag & drop și din stepperul fișei, iar
toate patru trebuie să lase aceeași dată în urmă. Data stă în `data_callback_dorit`, care de acum
înseamnă **„ziua în care sunăm noi"** la „Nu a venit" și „ziua cerută de om" la „Contactat". De acolo
leadul apare singur în „De lucrat azi" (grupul *Callback scadent*), urcă în capul coloanei și
primește ⚑ de la cronul de seară (bucket `nu_a_venit_de_sunat`).

⚠️ **`data_callback_dorit` se curăță la ieșire.** Același trigger o șterge când leadul trece într-un
status în care n-are înțeles. Era o scurgere veche: 28 de leaduri din „Programat", „A venit" și
„Waiting List" cărau o dată rămasă din faza de „Contactat" și apăreau zilnic la *Callback scadent* cu
un termen pe care nu-l ceruse nimeni.

**Ce se sparge dacă cineva pune la loc SMS-ul:** textele din `procedura.ts` promit acum un apel, iar
ghidul recepției e generat din ele. Un SMS readăugat fără să treacă prin `procedura.ts` + `npm run
gen:ghid` înseamnă că omul primește și mesaj, și telefon, pentru aceeași absență.

## Regulă → loc în cod

| Regulă | Unde trăiește |
|---|---|
| Termenul primului apel (18:00 / a doua zi 12:00) | `termenPrimulApel()`, `src/features/leads/procedura.ts` |
| „Ce fac cu cardul ăsta" | `actiuneCard()`, același fișier |
| Textele pe status | `STATUS_PROCEDURA`, același fișier |
| Ce are de lucru cronul de seară (praguri + politică) | `leads_de_flagat_seara()`, `20260918150000_leads_seara_si_prune.sql` |
| Categoria motivului, la orice intrare în Nurture | trigger `leads_motiv_categorie` + `deduce_motiv_categorie()`, `20260918140000` |
| Cine intră în numitorul conversiei | `lead_intra_in_palnie()`, `20260918160000` |
| Termenul primului apel, în DB | `lead_termen_primul_apel()`, `20260918150000` |
| Ziua neprezentării (cele 10 zile) | `lead_data_neprezentarii()`, `20260918150000` |
| Ziua apelului după neprezentare (+2 zile, weekend ⇒ luni) | `lead_zi_apel_dupa_neprezentare()`, `20260919140000` |
| Ștampila zilei de apel + curățarea ei la ieșire | trigger `lead_ziua_apelului`, `20260919140000` |
| Mutarea cardului = contact | trigger `lead_contact_dedus`, `20260918120000_contact_dedus_din_mutare.sql` |
| Categoriile de motiv | `MOTIVE_PIERDUT` / `MOTIVE_NURTURE`, `src/features/leads/constants.ts` + CHECK în `20260918100000` |
| Prag încercări fără răspuns (3) | `updateLead()`, `src/features/leads/api/transitions.ts` + bucket-ul `plasa_3_incercari` |
| A 2-a neprezentare → Nurture | `resolveNoShow()`, `transitions.ts` + `prune_expired_leads()` |
| Programare expirată → Nu a venit | `prune_expired_leads()`, `supabase/migrations/20260909110000_prune_expired_leads_sursa_unica.sql` |
| Lista de sunat de luni | pasul 2 din `supabase/functions/cron-morning/index.ts` |
| SMS-urile de lead (texte) | `supabase/functions/_shared/sms.ts`; catalog: `scripts/sms/templates.md` |
| Ce SMS pleacă la ce tranziție | `src/features/leads/sms.ts` + `supabase/functions/cron-afternoon/index.ts` (neprezentarea **nu** mai trimite nimic) |
| Orele liniștite (19:30–10:00) | `supabase/functions/_shared/quietHours.ts` |
| Un lead = o singură programare | RPC `inlocuieste_programari_lead` |
| Conversia (client + înrolare) | `src/features/leads/api/conversie.ts` + trigger `enrollment_marcheaza_lead_convertit` |
| Gardul „clientul e activ, nu-l nurtura" | `leaduriProtejate()`, `supabase/functions/_shared/leadNurture.ts` |

## Toate drumurile către Nurture

Sunt **13 locuri** care scriu `status = 'nurture'`. De asta categoria motivului se ștampilează
central, într-un trigger (Faza 2a), nu la fiecare apelant.

| # | Când | Unde | Automat? |
|---|---|---|---|
| 1 | N încercări consecutive fără răspuns | `api/transitions.ts` · `updateLead` | da |
| 2 | A 2-a neprezentare | `api/transitions.ts` · `resolveNoShow` | da |
| 3 | A 2-a neprezentare, la curățenia de seară | `prune_expired_leads()` | da |
| 4 | ~~Steguleț ignorat (nou / contactat)~~ | — | ❌ **scos pe 18 sept.** |
| 5 | „Nu a venit" mai vechi de 10 zile, **sunat** cel puțin o dată | `cron-evening` | da |
| 6 | Plasa de siguranță pe nr. de încercări (și pe „Nu a venit") | `cron-evening` | da |
| 7 | A 2-a luni după demo, neconvertit | `cron-morning` | da |
| 8 | Waiting list, la finalul sezonului | `cron-season-end` | da |
| 9 | Client devenit EXclient (45 zile fără prezență) | `auto_mark_inactiv_si_exclient()` | da |
| 10 | Reziliere cu bifa de reintegrare | `api/conversie.ts` · `reintegrateClientAsLead` | nu |
| 11 | Participant la workshop | `src/features/plati/api/incasari.ts` | nu |
| 12 | Butonul „🌱 Mută în Nurture" | `LeadModal/IdentityRail.tsx` | nu |
| 13 | Pastila „Nurture" din stepper | `LeadModal/PipelineStepper.tsx` | nu |

**Livrat pe 18 septembrie (Faza 2a):** au rămas doar drumurile în care OMUL n-a răspuns / n-a
venit / nu s-a înscris. Rândul 4 e scos (⚑ ignorat pe `nu_raspunde` și pe `de_revenit` înseamnă că
**noi** n-am sunat — vina noastră nu scoate omul din pipeline), iar pragul de la rândurile 1 și 6 e
3, nu 4. Asta închide TODO-ul „revizuim toate definițiile nurture" din 1 septembrie.

Fiecare dintre drumurile rămase își pune singur categoria motivului — nu fiindcă și-o scrie fiecare
apelant, ci fiindcă triggerul `leads_motiv_categorie` o deduce din statusul de plecare.

## Livrat pe 18 septembrie 2026

- **Procedura vizibilă**: tooltip pe card („ce fac cu el", calculat din starea cardului), tooltip pe
  status (cap de coloană, badge, pastila și pașii din fișă), ℹ︎ cu procedura completă, „Pasul următor"
  pe toate statusurile. Waiting List pliată implicit.
- **Categorii închise de motiv** (`leads.motiv_categorie`) + `MotivModal`, în care **motivul ales decide
  destinația**: recepția nu mai alege întâi coloana și apoi motivul.
- **Limbo-ul „Contactat fără sub-status" e imposibil**: „A răspuns" cere un pas următor, iar salvarea
  fișei cere sub-status.
- **Cadența 3-în-5-zile** propusă automat; pragul 4 → 3.
- **Grupuri noi în „De lucrat azi"**: Au venit azi la demo · Noi de sunat azi (pe termenul real) ·
  Contactate fără pas următor · Clienți care au cerut ceva.
- **Mutarea cardului = contact** (secțiunea de mai sus) + scorecard cu logate/deduse separat.

## Livrat pe 18 septembrie 2026 — Faza 2a

**Categoria motivului se ștampilează central.** 13 locuri scriu `status = 'nurture'`; niciunul nu
mai are voie să uite motivul. Triggerul `leads_motiv_categorie` deduce categoria din statusul de
plecare (`deduce_motiv_categorie()`), iar categoria aleasă de un om bate întotdeauna deducția. La
ieșirea din pool (reactivare, conversie târzie) categoria se curăță singură.

Backfill pe cele 6.200 de rânduri din Nurture, dedus din `lead_history`, nu din „tot ce nu e
ex-client devine istoric":

| Categorie | Rânduri | Cine sunt | În numitorul conversiei? |
|---|---:|---|---|
| `ex_client` | 5.604 | umbre de foști cursanți | nu |
| `import` | 373 | Meta Ads turnate direct în Nurture de importul din Sheet, zero contactări | nu |
| `nu_a_raspuns` | 72 | plecați din „Contactat" | da |
| `a_venit_neinscris` | 70 | au fost fizic la o clasă | da |
| `nu_a_venit` | 47 | neprezentări | da |
| `neatins` | 29 | au căzut din „Nou" — **nu i-a sunat nimeni** | da |
| `altul` | 4 | mutați manual din „Pierdut" | da |
| `waiting_list_final_sezon` | 1 | măturarea de final de sezon | da |

`neatins` e o categorie nouă, adăugată aici: niciuna din cele existente nu descria „a căzut fără
să-l atingă cineva", iar distincția e exact ce ordonează lista de recuperare din Faza 4.

**Cele 24 de rânduri din „Pierdut" au rămas fără categorie, intenționat** — vezi
[Decizii deschise](#decizii-deschise).

**Cronul de seară citește o singură funcție SQL.** `leads_de_flagat_seara()` întoarce, pe fiecare
lead, bucket-ul, acțiunea (`flag` / `nurture`) și categoria. Pragurile nu mai trăiesc în TypeScript,
deci se pot vedea într-un dry-run înainte de a fi schimbate:

```sql
select bucket, actiune, count(*) from leads_de_flagat_seara() group by 1,2;
```

Trei reguli s-au schimbat cu ocazia asta:

- **Termenul coloanei „Nou"** se compara cu `created + 24h`; acum e termenul din procedură
  (`lead_termen_primul_apel()`, oglinda lui `termenPrimulApel()` din `procedura.ts`).
- **Cele 10 zile de la „Nu a venit"** se numărau din `leads.updated` — orice editare a fișei
  resetează ceasul. Măsurată pe 18 sept., regula veche prindea **0 leaduri**, cea nouă
  (`lead_data_neprezentarii()`) prinde **11**. Regula exista pe hârtie și nu se aplica de fapt.
- **Plasa de siguranță** e la 3 încercări, ca `MAX_INCERCARI_FARA_RASPUNS` din frontend.

**Bifa instructorului mută leadul.** `prune_expired_leads()` are un pas nou: `programat` cu ultima
programare consumată `prezent` → `a_venit`. Până acum omul care fusese în sală primea a doua zi
SMS-ul „ne pare rău că n-ai ajuns". Latent (0 cazuri în 30 de zile), reparat înainte să se vadă.
Tot acolo, `current_date` (ziua serverului, UTC) a devenit data locală București — funcția rulează
la 23:30/00:30, fix în fereastra în care UTC e încă „ieri".

**K5 și pâlnia nu mai exclud Nurture în bloc.** `status <> 'nurture'` era o poartă din care se putea
ieși: orice lead mutat în Nurture dispărea din numitor, deci conversia creștea exact când munca nu se
făcea. Acum iese doar ce n-a fost niciodată lead de vânzare — `ex_client`, `import`, `istoric`
(`lead_intra_in_palnie()`). Efectul pe cohorta august 2026:

| Locație | Înainte | După |
|---|---|---|
| Ștefan cel Mare | 24/45 = **53,3%** | 24/55 = **43,6%** |
| Nicolina | 2/13 = **15,4%** | 2/20 = **10,0%** |
| Quasar 4 Kids | 3/27 = **11,1%** | 3/32 = **9,4%** |

Scăderea e diferența dintre ce s-a raportat și ce s-a întâmplat. Aceeași corecție în
`get_lead_funnel` și `get_conversie_leads`.

**„De ce au plecat"** — tabel nou în `/leads` → Rapoarte, din `get_lead_motive(from, to)`, cu
rândurile din afara pâlniei marcate ca atare.

## Decizii deschise

- **Cele 24 de leaduri din „Pierdut" n-au categorie.** Citite pe 18 sept., ~20 dintre ele au motive
  care, sub procedura decisă pe 09-17, înseamnă **Nurture**, nu Pierdut: „e prea departe locația",
  „are un alt opțional miercurea", „va reîncerca anul viitor", „a ales alt studio". Doar 2–3 sunt
  Pierdut adevărat (număr greșit, refuz explicit). A le pune o categorie din lista „Pierdut" ar fi o
  minciună; a le muta în Nurture înseamnă a reclasifica judecata unor oameni pe baza textului liber.
  **De decis cu Alex** — sunt 20 de leaduri care s-ar întoarce în bazinul de recuperare.
- **Backfill-ul contactelor deduse din istoric.** Neluat intenționat — ar rescrie retroactiv cifre
  legate de evaluarea oamenilor.

## Decis, încă nelivrat

Plan complet: `~/.claude/plans/fiecare-coloana-din-kanban-lexical-biscuit.md`.

- **Faza 2b** — SMS `apel_ratat` după prima încercare fără răspuns · verificarea `opt_out_marketing`
  la trimitere (azi nu se face nicăieri, deși ghidul promite că se face).
- **Faza 2c** — alerta de 21:30 pentru prezențele nebifate (`notifica_leaduri_nebifate()`).
- **Faza 3** — Waiting List legat de o grupă concretă + alertă când se eliberează un loc ·
  re-aplicarea readuce leadul pe lista de sunat, cu badge „🔁 a aplicat din nou".
- **Faza 4** — ecranul `/recuperare`: 584 de leaduri reale din Nurture (373 din reclame plătite,
  niciodată atinse), ordonate după cât de cald e leadul.

## De unde se continuă

**Stare la 19 septembrie 2026:** fazele 0, 1 și 2a sunt livrate — migrațiile `20260918100000` …
`20260918160000` sunt aplicate pe producție, iar `cron-evening` / `cron-morning` sunt deployate
(19 sept., 11:34). Peste ele, `20260919140000` a mutat „Nu a venit" pe apel.

⚠️ **Edge functions de deployat:** `cron-afternoon` (nu mai trimite `followup`) și `send-lead-sms`
(tipul `followup` scos). Până la `npx supabase functions deploy`, versiunea veche a lui
`cron-afternoon` mai poate trimite SMS-ul „ne pare rău că nu ai ajuns" — dedup-ul pe `sms_logs` îi
acoperă pe cei 46 care l-au primit deja, dar nu și pe cine intră nou în coloană.
**Verifică cu `npx supabase functions list` înainte să declari închis.**

Următorul pas e **Faza 2b** (SMS `apel_ratat` + verificarea opt-out). Două lucruri de ținut minte:

1. **Regula scrisă și codul nu se mai contrazic** — documentul descrie exclusiv ce face codul, cu
   excepția notată mai sus despre deploy.
2. **Decizii deschise:** cele 24 de rânduri din „Pierdut" fără categorie și backfill-ul contactelor
   deduse din istoric — vezi [Decizii deschise](#decizii-deschise).

Planul complet, cu fișierele de atins și rețeta de verificare pe fiecare fază:
`~/.claude/plans/fiecare-coloana-din-kanban-lexical-biscuit.md`.

## Capcane găsite la analiză (nereparate)

- ✅ **Bifa instructorului nu mută leadul** — reparat în Faza 2a (pasul 2 din `prune_expired_leads`).
- **`cron-season-end` alege sezonul după `data_incepere desc`**, deci câștigă sezonul viitor și
  măturarea waiting list probabil n-a rulat niciodată. Faza 3a.
- **`trg_leads_auto_opt_out` caută textul „opt-out" în `motiv_pierdut`** — moare tăcut dacă trecem pe
  categorii fără să-l schimbăm în aceeași migrație.
- **`opt_out_marketing` nu e verificat la trimiterea SMS-urilor**, nicăieri. Ghidul
  `sms-template.html` încă promite că e. Se închide în Faza 2b.
