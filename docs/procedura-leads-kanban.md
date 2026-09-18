# Procedura pe statusurile de leads

Sursa de adevăr pentru ce are de făcut recepția cu un lead și ce face aplicația singură.
Decizii Alex, **17 septembrie 2026**.

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
> 6. **Programat** — recepția bifează prezența în ziua ședinței. Nebifat ⇒ pleacă SMS-ul greșit.
> 7. **A venit** — discuția de după clasă e pasul care aduce înscrierea, nu SMS-ul.
> 8. **Nu a venit** — nu se sună. Dacă revine el, reprogramezi.
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

## Regulă → loc în cod

| Regulă | Unde trăiește |
|---|---|
| Termenul primului apel (18:00 / a doua zi 12:00) | `termenPrimulApel()`, `src/features/leads/procedura.ts` |
| „Ce fac cu cardul ăsta" | `actiuneCard()`, același fișier |
| Textele pe status | `STATUS_PROCEDURA`, același fișier |
| Steguleț ⚑ pe leaduri neglijate | `processStale()`, `supabase/functions/cron-evening/index.ts` |
| Mutarea cardului = contact | trigger `lead_contact_dedus`, `20260918120000_contact_dedus_din_mutare.sql` |
| Categoriile de motiv | `MOTIVE_PIERDUT` / `MOTIVE_NURTURE`, `src/features/leads/constants.ts` + CHECK în `20260918100000` |
| Prag încercări fără răspuns | `updateLead()`, `src/features/leads/api/transitions.ts` + plasa din `cron-evening` |
| A 2-a neprezentare → Nurture | `resolveNoShow()`, `transitions.ts` + `prune_expired_leads()` |
| Programare expirată → Nu a venit | `prune_expired_leads()`, `supabase/migrations/20260909110000_prune_expired_leads_sursa_unica.sql` |
| Lista de sunat de luni | pasul 2 din `supabase/functions/cron-morning/index.ts` |
| SMS-urile de lead (texte) | `supabase/functions/_shared/sms.ts`; catalog: `scripts/sms/templates.md` |
| Ce SMS pleacă la ce tranziție | `src/features/leads/sms.ts` + `supabase/functions/cron-afternoon/index.ts` |
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
| 4 | Steguleț ignorat (nou / contactat) | `cron-evening` · `processStale` | da ⚠️ **se scoate** |
| 5 | „Nu a venit" mai vechi de 10 zile | `cron-evening` | da |
| 6 | Plasa de siguranță pe nr. de încercări | `cron-evening` | da |
| 7 | A 2-a luni după demo, neconvertit | `cron-morning` | da |
| 8 | Waiting list, la finalul sezonului | `cron-season-end` | da |
| 9 | Client devenit EXclient (45 zile fără prezență) | `auto_mark_inactiv_si_exclient()` | da |
| 10 | Reziliere cu bifa de reintegrare | `api/conversie.ts` · `reintegrateClientAsLead` | nu |
| 11 | Participant la workshop | `src/features/plati/api/incasari.ts` | nu |
| 12 | Butonul „🌱 Mută în Nurture" | `LeadModal/IdentityRail.tsx` | nu |
| 13 | Pastila „Nurture" din stepper | `LeadModal/PipelineStepper.tsx` | nu |

**Decis pe 09-17:** rămân doar drumurile în care OMUL n-a răspuns / n-a venit / nu s-a înscris.
Rândul 4 se scoate (⚑ ignorat pe `nu_raspunde` și pe `de_revenit` înseamnă că **noi** n-am sunat),
iar pragul de la rândurile 1 și 6 scade de la 4 la 3. Asta închide TODO-ul „revizuim toate
definițiile nurture" din 1 septembrie.

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

## Decis, încă nelivrat

Plan complet: `~/.claude/plans/fiecare-coloana-din-kanban-lexical-biscuit.md`.

- **Faza 2** — trigger care ștampilează categoria la orice intrare în Nurture + backfill din
  `lead_history` · scoaterea drumului 4 din tabelul de mai sus · cele 10 zile numărate de la
  neprezentare · SMS `apel_ratat` după prima încercare fără răspuns · verificarea opt-out la trimitere ·
  alerta de 21:30 pentru prezențele nebifate · Nurture rămâne în numitorul K5 și al pâlniei (ies doar
  `ex_client` / `import` / `istoric`).
- **Faza 3** — Waiting List legat de o grupă concretă + alertă când se eliberează un loc ·
  re-aplicarea readuce leadul pe lista de sunat, cu badge „🔁 a aplicat din nou".
- **Faza 4** — ecranul `/recuperare`: 584 de leaduri reale din Nurture (373 din reclame plătite,
  niciodată atinse), ordonate după cât de cald e leadul.

## Capcane găsite la analiză (nereparate)

- **Bifa instructorului nu mută leadul.** `marcheaza_prezenta_lead_*` scriu doar în `programari_leads`;
  leadul rămâne `programat`, iar noaptea devine `nu_a_venit` ⇒ SMS greșit. Latent (0 cazuri în 30 de zile),
  se repară în Faza 2a.
- **`cron-season-end` alege sezonul după `data_incepere desc`**, deci câștigă sezonul viitor și
  măturarea waiting list probabil n-a rulat niciodată. Faza 3a.
- **`trg_leads_auto_opt_out` caută textul „opt-out" în `motiv_pierdut`** — moare tăcut dacă trecem pe
  categorii fără să-l schimbăm în aceeași migrație.
- **`opt_out_marketing` nu e verificat la trimiterea SMS-urilor**, nicăieri. Ghidul
  `sms-template.html` încă promite că e. Se închide în Faza 2b.
