# Checklist trimestrial de securitate

> O dată la 3 luni (ian., apr., iul., oct.), ~2 ore. Faza 4 din planul de securizare.
> Bifează într-o copie datată în `Management/GDPR/` și notează ce ai găsit.

## Backup — un backup netestat nu e backup
- [ ] Supabase → Backups: există backupul de azi-noapte (cere planul Pro).
- [ ] Exportul propriu (`node scripts/backup-export.mjs`) a rulat în ultima săptămână și manifestul spune `complete: true`.
- [ ] **Restaurare de probă** într-un proiect Supabase gol: numărul de clienți, familii și încasări e același cu producția.
- [ ] Contractele semnate din Storage sunt și ele în backup (pg_dump nu le ia).
- [ ] Time Machine face copii (dosarele `Management/`, `docs/` nu sunt în git).

## Conturi și acces
- [ ] Lista de conturi staff din Supabase → Authentication: fiecare om e încă în echipă, cu rolul corect.
      Plecații — șterși sau „ban".
- [ ] Cine are `owner`/`admin` (digestul zilnic îți spune dacă s-a schimbat ceva între timp).
- [ ] Contul agenției (`marketing`) e încă necesar; DPA-ul cu agenția e valabil.
- [ ] 2FA activ pe: Google Workspace (toate căsuțele), Supabase, Vercel, GitHub, Cloudflare, Neon, Netopia,
      FGO, theMarketer, Meta Business, Google Ads, ROTLD, Apple ID, managerul de parole.
- [ ] Echipele Vercel/GitHub/Supabase nu au membri străini (agenții vechi, foști colaboratori).
- [ ] Supabase → Authentication: „Allow new users to sign up" = OFF.

## Cod și dependențe
- [ ] `npm audit --omit=dev` în qapp v2, qapp-membri și site — nicio vulnerabilitate critică/înaltă nerezolvată.
      (⚠️ `npm audit fix --omit=dev` dezinstalează devDependencies — `npm install` după.)
- [ ] Gardienii trec: `check-rls-parinte`, `check-rls-marketing`, `check-rls-teacher`, `check-anon-rpc`,
      `check-views`, `check-citire-anon`, `check-drepturi-tabele`, `check-audit-bani`, `check-edge-roles`
      (toate în `scripts/`), plus `scripts/test-auth-guard.mjs`.
- [ ] Supabase → Advisors → Security: nimic nou în afară de `extension_in_public`.
- [ ] Rapoartele CSP (`csp_reports` în Neon) nu arată resurse blocate noi.

## Date personale (GDPR)
- [ ] Registrul de breșe (`Management/GDPR/registru-brese.md`) e la zi.
- [ ] Registrul de prelucrări (art. 30) — furnizor nou sau scop nou în trimestru? Adaugă-l.
- [ ] Cererile de acces/ștergere primite au fost rezolvate în 30 de zile.
- [ ] Exporturile cu date reale nu stau în repo (`git status --short --untracked-files=all`) și nici în Downloads.
- [ ] `securitate_digest`: nicio zi cu semnale rămase neverificate.

## Plăți
- [ ] Nicio comandă Netopia „pending" mai veche de o zi.
- [ ] Toate plățile online confirmate au factură.
