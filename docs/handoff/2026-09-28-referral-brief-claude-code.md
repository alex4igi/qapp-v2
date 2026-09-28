# Brief pentru Claude Code — campania de recomandări

**Stare:** deschis — propunere de proces, 2026-09-28; nicio implementare.

Acest brief este varianta scurtă de lucru. Contextul și discuția completă sunt în [handoff-ul campaniei](./2026-09-27-campanie-recomandari-varsity-teens.md). Claude Code verifică propunerile pe codul și datele reale înainte de implementare.

## Reguli confirmate de Alex

- **Confirmat de Alex:** campania se promovează în grupele sub prag, cu interes prioritar pentru Varsity și Teens; o recomandare este recompensabilă și dacă prietenul se înscrie în altă grupă.
- **Confirmat de Alex:** fiecare prieten care se înscrie și achită luna octombrie aduce **60 lei credit în contul familiei** care l-a recomandat. Aceeași familie poate primi recompensa de mai multe ori pentru prieteni diferiți.
- **Confirmat de Alex:** invitatul poate fi client nou sau fost client care revine; prima oră este gratuită.
- **Confirmat de Alex:** dacă după proba de la finalul lui octombrie nu mai există ședințe de plătit în octombrie, plata primei rate din noiembrie poate declanșa recompensa.
- **Confirmat de Alex:** la curs se anunță campania și se dau cartonașe fizice cu mai multe bilete detașabile; familia invită personal prietenii. Rezultatele se urmăresc cel puțin două luni.
- **Confirmat de Alex:** nu se tipăresc coduri diferite pentru fiecare copil. Toate biletele pot avea același QR către formular; invitatul declară cine l-a invitat.

## Parcurs propus

1. **La curs:** instructorul anunță campania, iar cursantul primește biletele generice. Familia care invită poate fi identificată prin numele cursantului și, dacă e nevoie, grupa/locația.
2. **Cerere de probă:** prietenul/părintele scanează QR-ul, sună sau vine la recepție. Toate cele trei căi colectează „Cine te-a invitat?”. Site-ul primește cererea, iar recepția confirmă grupa, data și locul.
3. **Atribuire:** recepția găsește familia recomandatoare în qapp și leagă solicitarea de ea **înainte de proba gratuită**. Identitatea trebuie păstrată și când persoana invitată există deja ca lead/client. O declarație ambiguă se verifică la recepție înainte de acordarea recompensei.
4. **Proba:** se folosește fluxul existent `Programat` → `A venit` / `Nu a venit`, cu bifă de prezență în roster. O cerere sau o programare fără prezență nu acordă credit.
5. **Înscriere și plată:** fluxul existent creează înrolarea și calculează prima rată. Plata integrală a ratei eligibile, inclusiv una prorată corect calculată, califică recomandarea. Dacă prima rată datorată este în noiembrie în excepția confirmată mai sus, ea califică recomandarea.
6. **Recompensă:** qapp acordă o singură dată 60 lei credit promoțional familiei pentru acel invitat. Același invitat nu poate produce două recompense, iar familia poate avea oricâți invitați diferiți. Creditul se vede și poate fi folosit la o plată viitoare a oricărui membru al familiei.
7. **Urmărire:** raport pe canalul de intrare, familie recomandatoare, invitat nou/revenit, grupa în care s-a promovat, grupa aleasă, proba, prima plată, creditul acordat și participarea/plățile în cele două luni următoare.

## Schimbări tehnice propuse, cu impact minim

- **Propunere — site public:** adăugați în formularul actual de programare demo un câmp opțional „Cine te-a invitat?” și transmiteți-l prin ruta serverului site-ului `/api/inscriere`. QR-ul generic deschide acest formular; nu conține un identificator de familie. Codul site-ului live este în repo separat, indicat în `../AGENTS.md`.
- **Propunere — intake:** extindeți `supabase/functions/intake-website-lead/index.ts` și persistența recomandării pentru a păstra numele declarat **și la telefon duplicat**. `insertLead` din `_shared/intake.ts` întoarce astăzi leadul existent fără să-i actualizeze `observatii`; `mesaj` și `campanie` nu rezolvă atribuirea sigură. Păstrați fluxul general de creare/deduplicare leaduri.
- **Propunere — qapp:** oferiți recepției un mod de a atașa/verifica familia recomandatoare la un lead nou sau existent, inclusiv pentru intrările prin telefon și direct. Păstrați un registru distinct al recomandărilor, cu stări verificabile: declarat → probă → înrolat → plată eligibilă → recompensat / anulat.
- **Propunere — bani:** acordarea creditului trebuie să fie idempotentă, auditată și legată de plata reală care a calificat recomandarea. Creditul promoțional la nivel de familie cere mecanism distinct sau adaptare explicită: soldul actual al clientului vine din supraplăți pe înrolări/datorii. Nu înregistrați o încasare fictivă și nu imitați recompensa cu un voucher de reducere.
- **Propunere — securitate:** pentru tabele/RPC-uri noi, urmați gardurile de rol, RLS, granturile și verificările din `AGENTS.md`. Nu expuneți datele familiei recomandatoare prin formularul public.

## Decizii încă deschise

- **Propunere de confirmat:** o rată corect prorată, indiferent de sumă, declanșează integral 60 lei; recompensa nu se proratează.
- **Propunere de confirmat:** fost client eligibil = fără înrolare activă în ziua înregistrării recomandării; o simplă reînnoire lunară nu se califică.
- **Propunere de confirmat:** termenul limită pentru cererea de probă și plata eligibilă. Textul tipărit trebuie să folosească aceste date după decizie.
- **Propunere de confirmat:** cum se corectează creditul dacă plata invitatului este anulată sau restituită, mai ales dacă familia a consumat deja creditul.
