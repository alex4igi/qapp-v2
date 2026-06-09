# Raport Call-Center / Scorecard — design & status

Document de referință pentru secțiunea de raport call-center (activitate vânzări/recepție).
Surse de inspirație: `Surse exemple/Activitate CC _v2 - *.csv`. Memorie persistentă: `project_scorecard_callcenter.md`.

## Scop
Owner-ul vrea să **măsoare performanța call-center-ului** ca să (a) definească clar responsabilitățile postului de recepție (`front_desk`) și (b) construiască ulterior un salariu corect. Recepția = rolul `front_desk`.

## Principii (valabile pentru toate fluxurile)
- **Logat vs Verificat (anti-gaming):** o acțiune logată contează la scor doar dacă are o **urmă externă pe care operatorul nu o poate fabrica**. Click-urile singure nu contează.
- **Per operator**, cu rollup pe locație. Atribuire pe `user_id`-ul celui care a făcut contactul (NU pe `responsabil_id`, care e poluat de cron/import).
- **Praguri editabile din UI** (doar owner), ancorate în industrie, ajustabile pe parcurs (`scorecard_praguri`).
- **Salariu = fază viitoare**, după ce pragurile se calibrează pe date reale (snapshot lunar înghețat, pe pattern-ul salarii teacheri).

## Trei fluxuri (din CSV-ul „Activitate CC")
1. **Leads** (`Zilnic`/`Campanie`) → conversie
2. **Restanțe** (`Datornici`) → recuperare
3. **Reactivări** (`Absenti`) → win-back clienți care alunecă

---

## STATUS — livrat (2026-06-09 / 2026-06-10)

### Faza 1 — Leads ✅
- `/scorecard` (acces `PRIVILEGED`), tab **Leads**. Per operator, praguri Sub/Standard/Peste, scor total.
- Buton „📞 Loghează contact" pe `LeadCard` + `LeadModal` → `lead_contacte` (enum-uri generice `canal_contact`/`rezultat_contact`).
- KPI controlabile: volum contacte verificate, viteză contactare (excl. weekend), persistență, igienă CRM, follow-up.
- KPI influențabile: conversie, show-rate demo.
- **Verificat** = SMS prin gateway / prezență demo / conversie. Flag-uri 🚩 rafală, ⚠️ decalaj.
- Banner backfill (`DATA_LANSARE_SCORECARD`); RPC `get_scorecard_operatori`.

### Faza 2 — Restanțe ✅ (+ revizuire v2)
- Tab **Restanțe** în `/scorecard`. RPC `get_scorecard_restante`.
- **Worklist dedicat `/recuperare`** (modul `src/features/recuperare/`, acces **ALL_STAFF fără teacher** — recepția e responsabilă; `/financiar` e PRIVILEGED deci worklist-ul NU putea sta acolo). RPC `get_restante_worklist`: clienți `status='Activ'` + **≥2 rate (luni) neachitate**; context: rest, #rate, zile depășire (scadență din `sezoane` via CASE din `get_sms_recipients`), ultima prezență, ultim apel. Buton „📞 Loghează apel" → `client_contacte` scop='recuperare'.
- **Card pe Dashboard** (`DatorniciWorklistCard`, `!teacherMode`): „📞 Datornici de sunat (N)" apare doar când N>0, top 8, link → `/recuperare`.
- **Anti walk-in (apel PRECEDE plata):** recuperat verificat = `incasari` reale unde `incasari.created > client_contacte.created` ȘI `incasari.data` în `[ziua_apel, +7z]` (prag `recuperare_fereastra_zile`). Same-day reușit (înregistrat după apel) = numără; walk-in dinainte de apel = nu.

### Faza 3 — Reactivări ✅ v1 (de înlocuit — vezi „de implementat")
- Tab **Reactivări** + buton „📞 Reactivare" pe clienții Inactiv/EXclient din `ClientiListPage` (am adăugat filtru de status). RPC `get_scorecard_reactivari`. Reactivat = prezență Prezent după contact.
- **NOTĂ:** designul de mai jos (worklist reactivare v2) îl rafinează semnificativ.

---

## DE IMPLEMENTAT — decizii agreate în sesiune (sesiune viitoare)

### A. Restanțe — KPI 7% pe bază SCADENT (fix)
- **Acum (greșit):** rata restanțe = `(de_incasat − incasat) / de_incasat` pe lună (din `restante_locatie_luna`). Luna curentă iese ~90% până pe 15, pentru că banii încă nu sunt restanță (n-a trecut scadența).
- **Agreat:** rata = **rest SCADENT** (a cărui scadență a trecut) ÷ de-încasat. Mai mic = mai bine, **țintă ≤7% în FIECARE lună** (inclusiv cea curentă, devine relevantă continuu).
- **Implementare:** RPC nou (ex. `get_rata_restante_scadent(p_luna, p_locatie)`) care calculează rest per rând de enrollment unde `current_date > scadenta` (CASE-ul de scadență: `sezoane.scadenta_prima_rata`/`scadenta_ultima_rata`, altfel ziua 15). Înlocuiește `getRataRestante` din `scorecard/api.ts`. Pragul `rata_restante` (deja seed-uit, `mai_mic_e_bine`, 7).

### B. Reactivare — worklist v2 (redesign complet)
**Populație (decizie: „doar absenți încă-înrolați", fără dublare):**
- **Inactiv** = ultima prezență **22–45 zile**, **ÎNCĂ înrolat** (neraziliat). Prioritar (cel mai recuperabil).
- Opțional **EXclient neraziliat** (>45z, încă pe liste).
- **EXCLUDEM** reziliații → ei sunt deja în **Nurture** (feature „re-lead la reziliere", cu `motiv_reziliere`); re-înrolarea lor = „convertit" în scorecard-ul **Leads**. Nu-i dublăm.
- **EXCLUDEM** nereînscrișii sezon-la-sezon → teritoriul **Reînscrieri**.
- **EXCLUDEM** clienții în **vacanță** (tabel `vacante`) — pauză planificată, nu churn.

**Context worklist:** nume, telefon, zile de la ultima prezență, rest (dacă are), ultim apel + rezultat. (Motiv plecare = doar pentru reziliați, care NU intră aici.)

**Succes (reactivat), fereastră 21 zile după apel, apelul precede revenirea:**
- **re-înrolare / plată** după apel, SAU
- **(pentru cei plătiți integral pe sezon)** revenire la **prezență** — altfel îi ratăm, ei nu mai fac nicio plată când revin.
- (recomandare anti-drop-in: eventual ≥2 prezențe, nu una singură.)

**KPI echipă = rată de rezolvare a listei:** „**≥7% din lista de inactivi revin în lună**" (reactivați ÷ listă). Mai mare = mai bine. Card sus pe tab-ul Reactivări (simetric cu KPI-ul restanțe). Per operator: volum apeluri reactivare, rată, igienă, scor.

**Idei suplimentare:**
- Segment **„plătit dar absent"** (a plătit luna dar nu vine) — risc de churn fără pârghia banilor; apeluri de mare valoare.
- Filtru **sezon curent vs alte sezoane**.
- **Opțiune respinsă acum (notată):** un „hub win-back" cu tab-uri read-only care adună și Retrași (din Nurture) + Nereînscriși (din Reînscrieri), trimițând în fluxul nativ. Am ales banda curată ca să nu dublăm; hub-ul rămâne posibil dacă se vrea o singură poartă.

---

## Anti-gaming — rezumat reguli de verificare
| Flux | „Verificat / reușit" = (ne-gameabil) |
|---|---|
| Leads | SMS prin gateway / prezență demo / conversie |
| Restanțe | `incasari` reale, **apel precede plata** (`incasari.created > contact.created`) + fereastră 7z |
| Reactivări | re-înrolare/plată/prezență după apel + fereastră 21z, apelul precede revenirea |

## Note de calibrare
- **Worklist restanțe** prinde și rânduri foarte vechi (artefacte migrare, `zile_depasire` ~2977). De evaluat un scope pe sezonul curent.
- **Praguri** = seed din industrie (HBR speed-to-lead, 6+ încercări, boutique fitness ~50% conversie, no-show ~30%); toate editabile din ⚙ Praguri (owner).
- Toate `client_contacte`/`lead_contacte` sunt **log imutabil** (fără politică DELETE).
