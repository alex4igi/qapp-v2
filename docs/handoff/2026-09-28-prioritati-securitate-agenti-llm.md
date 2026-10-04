# Priorități de securitate în contextul agenților LLM

**Stare:** deschis — verificare 2026-09-28. Analiză din documentația și codul local; configurația live, conturile furnizorilor și restaurarea backupului nu au fost verificate. Nicio propunere de mai jos nu este confirmată de Alex pentru implementare.

## Context verificat în repo

- **Propunere — evaluare:** tratați auditul din 20 septembrie ca istoric, nu ca stare curentă. Între timp au apărut reguli RLS pentru instructor, scriptul de backup programat, digestul de securitate și runbookul de incident. Existența lor în repo nu dovedește că funcționează în producție sau că backupul poate fi restaurat.

## Ordine propusă

1. **Propunere — protecția conturilor privilegiate:** verificați 2FA/passkeys pentru Supabase, Vercel, GitHub, Google Workspace, Neon, procesatorul de plăți, DNS și conturile owner/admin din qapp; revocați conturile nefolosite și limitați accesul agenției și al instructorilor la datele necesare.
2. **Propunere — recuperarea datelor:** verificați ultima copie completă (inclusiv contractele din Storage), alertele jobului programat și o restaurare de probă într-un mediu separat. Luați în calcul o copie independentă de laptop și backupul gestionat de furnizor.
3. **Propunere — autorizare verificată adversarial:** pentru fiecare rol (anon, părinte, marketing, teacher, staff), testați direct API-ul, inclusiv ID-uri ale altor familii/grupe, RPC-uri `security definer`, view-uri și edge functions. Păstrați scripturile de verificare din `AGENTS.md` ca poartă la fiecare migrație relevantă.
4. **Propunere — limitarea automatizării abuzive:** aplicați limite de trafic și cost la login, resetare parolă, formulare publice, SMS și plăți, cu alerte pentru anomalii. WAF/Turnstile ajută la volume, dar nu repară autorizarea greșită.
5. **Propunere — flux financiar:** verificați periodic concordanța Netopia–comenzi–încasări–facturi; alertați plățile confirmate fără comandă finalizată și păstrați modificările banilor prin RPC-uri auditate.
6. **Propunere — proces continuu:** revizie de securitate la modificările de RLS/RPC/edge functions, actualizări de dependențe, exercițiu trimestrial de incident și test de penetrare independent înaintea extinderii funcțiilor publice.
7. **Propunere — agenți proprii, dacă sunt introduși:** agentul primește drepturi minime, limitate la sarcina curentă; operațiile asupra banilor, datelor personale și publicării cer aprobare umană și verificare pe server. Textul din documente, emailuri sau pagini web este intrare neîncredere, nu instrucțiune de autorizare.

**Limită:** reducerea riscului și a pagubelor este realistă; absența totală a vulnerabilităților nu poate fi garantată.
