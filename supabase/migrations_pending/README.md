# Migrații pregătite, neaplicate

Nu intră în `supabase db push` (sunt în afara lui `migrations/`). Se aplică manual,
prin MCP `apply_migration`, apoi fișierul se mută în `migrations/` cu versiunea dată de server.

- `revenire_rls_teacher_pe_grupa.sql` — revenirea pentru `20260926192605_rls_teacher_pe_grupa.sql`
  (4.6 / Faza 3, aplicată 26 sept. 2026), dacă filtrul pe grupă blochează un ecran de instructor.
  Scoate doar politicile, fără redeploy; migrația originală e idempotentă și se poate reaplica.
