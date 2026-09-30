# Campanie integrată — Quasar Dance vine în Valea Lupului

**Stare:** preluat de Claude 29.09.2026 — etapa 1 (preînscrieri, LP, decizie grupe) implementată; regulile în `docs/reguli-domeniu.md` §11. Etapa 2 (DEMO) și locația completă rămân deschise. Ultima verificare: 2026-09-29. Analiză și propuneri pentru discuție; fără implementare, migrații, deploy sau modificări în DB. Codul local qapp și al site-ului public a fost citit; datele și configurația producției nu au fost verificate.

## 1. Brief

- **confirmat de Alex:** urmează deschiderea unei locații Quasar Dance în Valea Lupului, lângă Iași.
- **confirmat de Alex:** campanie unitară cu landing page, beneficii Quasar Dance, formular inclus, flyere și QR către LP.
- **confirmat de Alex:** titlul campaniei: „Quasar Dance vine în Valea Lupului”.
- **confirmat de Alex:** formularul colectează și informații de piață: vârsta copilului, preferințe orare între 13:00 și 19:00, interes pentru dans, gimnastică, K-pop, Zumba.
- **confirmat de Alex:** folosirea materialelor de flyer și în ads este o posibilitate, nu o decizie finală.
- **confirmat de Alex:** deschidere din noiembrie; locația este la Școala Verde, cu detaliile exacte ale spațiului/accesului încă de stabilit. Anul 2026 este dedus din contextul discuției.
- **confirmat de Alex:** Zumba pentru toate vârstele la început; opțiunile trebuie să permită selecție multiplă.
- **propunere:** până la stabilirea zilei exacte, accesului, grupelor și programului, tratăm formularul ca preînscriere/exprimare de interes. Nu promitem un loc, o grupă sau un orar confirmat. LP-ul poate anunța „Din noiembrie, la Școala Verde”.

## 2. Ce există și ce trebuie extins

Fiecare punct de mai jos este **propunere**, cu observația tehnică verificată în cod local ca motiv al propunerii.

| Observație din cod | Propunere pentru campanie |
|---|---|
| Site-ul real este Next.js în `~/Documents/Website React/quasar-dance`, separat de CRM; `/api/inscriere` cheamă `intake-website-lead` cu secret server–server. | LP la `quasardance.ro/valea-lupului`, în site-ul existent, cu aceeași intrare în qapp. |
| `/api/inscriere` acceptă doar trei nume de campanie în `ALLOWED_CAMPAIGNS`; orice nume nou cade pe campania implicită. | Adăugare explicită a campaniei Valea Lupului pe site și mapare coerentă în CRM. |
| `LOCATII` din leads și `LOCATIE_ALIASES` din intake conțin trei locații. O locație nemapată ajunge în observații, iar câmpul `locatia` rămâne gol. | Introducere Valea Lupului în nomenclator, filtre și mapări; audit al potrivirilor locației și rolurilor staff. |
| `_shared/sms.ts` recunoaște doar locațiile actuale și folosește Ștefan cel Mare ca fallback pentru adresă. | Înainte de orice programare, configurare adresă/telefon Valea Lupului și verificarea mesajelor. Nu trimitem confirmări cu adresa implicită greșită. |
| Intake suportă `varsta`, dar `intake-website-lead` și ruta site-ului nu transmit azi vârsta numerică. `interes` este singular; nu există preferințe structurate de orar în formularul actual. | Extindere explicită a contractului site → intake → DB → fișă → raport. Nu salvăm studiul numai în `mesaj`. |
| `insertLead` deduplică pe telefon normalizat și returnează imediat leadul existent. Logul păstrează atribuirea, fără profilul copilului sau răspunsurile la studiu. | Cerere de campanie distinctă, persistată și când telefonul există. Telefonul identifică un contact, nu unicitatea unui copil. |
| `get_lead_funnel` raportează cohorta după `leads.created`. | Raport Valea Lupului după data cererii de campanie; o reaplicare a unui lead vechi nu trebuie să dispară din raport. |
| Gimnastica este mapată la interesul CRM `Acrobatică`; regulile Meta au și locații implicite pentru anumite formulare. | Etichetă publică „Gimnastică”, cu mapare validată; dacă folosim formulare Meta native pentru Valea Lupului, nu moștenim automat Nicolina. |
| Site-ul are Turnstile condiționat de configurare, email de confirmare și Meta CAPI condiționat de acordul pentru cookie-uri marketing. LP-ul existent păstrează acordul de comunicări în mesaj liber. | Refolosirea componentelor, confirmare adaptată preînscrierii și acorduri structurate. Verificare setări deploy înainte de lansare. |

Surse locale: `src/features/leads/constants.ts`, `LeadFilters.tsx`, `LeadModal/sections/ProfilInteresSection.tsx`, `api/crud.ts`, `api/reports.ts`; `supabase/functions/intake-website-lead/index.ts`, `_shared/intake.ts`, `_shared/sms.ts`, `_shared/meta.ts`; `docs/reguli-domeniu.md` §6; pe site `app/api/inscriere/route.ts` și `app/back-to-dance-school/landing.tsx`.

## 3. Parcursul propus

- **propunere:** flyer / ad / postare / recomandare → același LP → cerere Valea Lupului → verificare de către recepția responsabilă → configurare grupe din cererea compatibilă → invitație la probă după stabilirea programului → prezență → înrolare/plată prin fluxul existent → portal membri.
- **propunere:** două etape ale aceleiași campanii: înainte de deschidere strângem preferințe; după confirmarea programului LP-ul permite solicitarea unei probe la grupele reale. URL-ul și QR-urile rămân valabile.
- **propunere:** responsabil nominal și termen de prim contact pentru campanie. Cererile noi nu rămân fără apel până la deschidere; răspunsul părintelui se verifică și se clarifică.
- **propunere:** separăm etapa cererii („primită”, „verificată”, „așteaptă programul”, „invitată”, „programată”, „înrolată”, „retrasă”) de statusul general al leadului. Lista aceasta este un model de lucru de validat, nu enum aprobat.
- **propunere:** așteptarea deschiderii nu intră în `waiting_list`, care în procedura actuală înseamnă exclusiv lipsa locului. Nici nu trecem automat în Nurture oamenii care așteaptă ca noi să publicăm programul. Leadurile noi pot intra în `nou` pentru primul contact; politica ulterioară trebuie verificată cu toate cronurile înainte de lansare. Reaplicările și clienții existenți apar într-o listă de lucru a campaniei fără resetarea statusului general.

## 4. Formularul

Toate alegerile de implementare de mai jos sunt **propunere**; câmpurile de studiu cerute de Alex rămân confirmate în §1.

| Câmp | Comportament propus |
|---|---|
| Pentru cine este cererea? | Copil / pentru mine; Zumba pentru toate vârstele este confirmat. Fiecare participant are vârstă și preferințe proprii. |
| Nume părinte/contact și telefon | Obligatorii; email opțional. |
| Prenume copil și vârstă în ani | Pentru cererile copiilor; derivăm grupa canonică: Tiny 4–6, Junior 7–10, Varsity 11–14, Teens 15–18. Nu inventăm data nașterii din vârstă. |
| Activități de interes | Dans / Gimnastică / K-pop / Zumba, selecție multiplă confirmată de Alex. „Dans” trebuie clarificat ca Street Dance dacă acesta este cursul oferit. |
| Preferință principală | Eventual întrebare opțională la apel sau într-un pas ulterior; nu condiționează selecția multiplă. Ajută la deosebirea alternativelor de dorința de a urma efectiv două activități. |
| Ore la care ați putea ajunge | Alegere multiplă; variantă de discutat: ore de începere 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, plus „flexibil”. Explicăm că sunt preferințe, nu program publicat. Trebuie clarificat dacă 19:00 este ultima începere sau limita de încheiere; pentru orare la jumătate de oră se ajustează opțiunile. |
| Zile disponibile | Lun–Vin, alegere multiplă; weekend doar dacă este luat în calcul operațional. Fără zile nu putem estima câți copii pot forma aceeași grupă. |
| Zonă/localitate | Opțional, răspuns scurt sau opțiuni locale; fără adresă de domiciliu completă. |
| Observații | Opțional: program școlar, experiență, frați. |
| Al doilea copil | Adăugare secțiune copil cu propriile preferințe; același contact părinte. |

- **propunere:** formular scurt, pe mobil; întrebările vizibile explică scopul: „Spune-ne ce vi s-ar potrivi, ca să construim programul noii locații”.
- **propunere:** CTA înainte de program: „Vreau să aflu când se deschide”; alternativ „Vreau să preînscriu copilul”. După confirmarea probelor: „Vreau o ședință de probă”. Gratuitatea se comunică numai dacă Alex o confirmă.
- **propunere:** mesaj de succes: „Am primit cererea pentru Valea Lupului. Te contactăm pentru detalii și îți comunicăm programul când este confirmat.” Fără rezervare fictivă sau termen de răspuns pe care echipa nu îl poate respecta.

## 5. Păstrarea datelor și rapoartele

- **propunere:** tabel/entitate de cereri de campanie, cu contact, copil/participant, campanie, locație dorită, dată, vârstă declarată, lista stilurilor selectate, preferință principală opțională, zile și ore disponibile, atribuirea și etapa de lucru. Numele și structura exacte le decide Claude după verificarea modelului actual.
- **propunere:** aceeași cerere poate fi legată de un lead și ulterior de client/înrolare. O potrivire numai pe telefon nu dovedește că doi copii sunt aceeași persoană; cazurile ambigue se rezolvă de recepție.
- **propunere:** repetarea tehnică a aceluiași POST este idempotentă; o cerere nouă intenționată pentru alt copil sau cu preferințe actualizate se păstrează. Răspunsurile au versiune/data colectării; nu rescriem sursa inițială a leadului sau conversiile istorice.
- **propunere:** salvarea cererii este obligatorie pentru răspunsul de succes; `leads_intake_log` este best-effort în cod și nu poate servi ca singur depozit al studiului.
- **propunere:** dashboard simplu în qapp: cereri, familii/contacte distincte, copii/participanți distincți după validare, cereri reaplicate, cereri verificate, probe, prezențe și înrolări/plăți. Achiziția nouă, revenirea și mutarea unui client existent se văd separat.
- **propunere:** matrice vârstă × stil × zi × oră pentru a decide grupele, cu păstrarea combinației de preferințe per participant. Numărăm fiecare persoană o singură dată în scenariul unei grupe; orele și stilurile bifate nu sunt înscrieri independente. Dacă raportăm procente pe opțiuni multiple, suma poate depăși 100% și trebuie explicată. Confirmăm separat dacă două stiluri sunt alternative sau două abonamente dorite.
- **propunere:** studiul este cerere declarată de persoane care au văzut campania, nu eșantion reprezentativ al tuturor locuitorilor. Confirmăm disponibilitatea la apel și prin probă. Pragul pentru pornirea unei grupe se calculează din costuri, sală, capacitate și instructor; nu introducem un număr arbitrar.
- **propunere:** costul per înscriere folosește plăți eligibile legate de înrolările campaniei. Pentru performanța noii locații, folosim grupa/sala/locația cursului; `incasari.locatie` rămâne locul unde s-au încasat banii, conform regulilor de domeniu.

## 6. LP, flyere și ads

- **propunere:** identitate comună: galben/negru Quasar, titlul confirmat, fotografie autentică, același mesaj și CTA. Beneficii pentru părinte: mișcare aproape de casă; pentru copil: coordonare, încredere, expresie și prieteni. Formulări despre experiența urmărită, fără rezultate garantate.
- **propunere:** structură LP: titlu + stadiul deschiderii + CTA; 3–4 beneficii; activități de interes; dovezi Quasar și fotografii/testimoniale aprobate; adresă/hartă când sunt confirmate; formular; întrebări frecvente. Cifrele din contextul companiei se reconfirmă înainte de publicare.
- **propunere:** flyer: titlu mare, beneficiu local, câteva activități, CTA, QR, URL lizibil și contactul ales. Fără studiul de piață tipărit și fără dată/adresă/ofertă neconfirmată.
- **propunere:** o campanie comercială, surse distincte. `utm_campaign=valea_lupului_deschidere` comun; de exemplu flyer: `utm_source=flyer`, `utm_medium=print`; Meta: `utm_source=facebook` / `instagram`, `utm_medium=paid_social`. `utm_content` distinge varianta creativă/lotul de distribuție, dar azi trebuie adăugat explicit pe tot traseul: nu este preluat de endpointurile citite.
- **propunere:** QR propriu spre un URL scurt pe domeniul Quasar care redirecționează la LP cu sursa lotului. Același QR per lot/partener, fără coduri per persoană. URL-ul poate continua să funcționeze după actualizarea LP-ului. Vizita prin QR măsoară accesarea linkului, nu dovedește înscrierea.
- **propunere:** ads trimit direct la LP; păstrează conceptul flyerului în variante de feed/story și video scurt. QR-ul rămâne util pe hârtie; pe mobil CTA-ul duce direct la formular. Testăm puține variante, cu raport pe cereri verificate și înrolări, nu doar clickuri.
- **propunere:** reclame locale și parteneriate cu comunități de părinți, școli/grădinițe și afaceri din zonă după alegerea adresei. Nu presupunem acces la distribuție sau audiențe externe deja autorizate.
- **propunere:** după confirmarea spațiului și instructorilor, o zi a porților deschise poate transforma interesul în probe. Invitațiile pornesc către cererile compatibile cu programul ales.

UTM-urile permit identificarea sursei, mediului și campaniei: [documentația Google Analytics](https://support.google.com/analytics/answer/10917952?hl=en). Extinderile CRM de mai sus sunt propuneri proprii, bazate pe codul local.

## 7. Date personale și acces

- **propunere:** informare clară despre scopul cererii și contactarea pentru Valea Lupului; acord separat, opțional și nebifat pentru alte comunicări promoționale. Acordul pentru cookie-uri/Meta nu ține locul acordului pentru mesaje. Păstrăm data și versiunea textelor acceptate și respectăm retragerea/opt-out în toate trimiterile relevante. Textele și temeiurile exacte se validează înainte de publicare.
- **propunere:** pagina publică nu citește leaduri sau răspunsuri; intrarea rămâne prin serverul site-ului. Secretul/service role nu ajunge în browser, conform [documentației Supabase](https://supabase.com/docs/guides/functions/secrets).
- **propunere:** stafful responsabil vede datele necesare; agenția primește statistici agregate pentru campanie. Orice tabel/RPC nou respectă toate gardurile, granturile și verificările din `AGENTS.md`; nu relaxăm politicile existente pentru formular.

## 8. Ordine propusă și verificare

- **propunere:** pornim de la noiembrie / Școala Verde / Zumba toate vârstele / selecție multiplă, deja confirmate. Rămân de stabilit ziua exactă, spațiul și accesul precis, sensul intervalului 13–19, scopul CTA și responsabilul de contactare.
- **propunere:** apoi realizăm fluxul cererii, locația/mapările, filtrele, raportul minim și LP-ul. Flyerele se trimit la tipar după verificarea QR-ului și a salvării reale în qapp.
- **propunere:** verificare înainte de lansare: cerere nouă; telefon existent în Nou/Nurture/convertit; client existent; doi copii cu același telefon; retry tehnic; preferințe multiple; atribuiri print/ads; raport fără dublare; păstrarea acordurilor; mesaje/adrese corecte; comportamentul cronurilor când programul încă nu există. Preferabil în staging; dacă se folosesc date de test în producție, se curăță conform regulilor proiectului.
- **propunere:** Claude verifică toate propunerile pe cod și date reale după confirmarea lui Alex; construiește numai partea confirmată. Acest handoff nu autorizează implementarea întregii liste.
