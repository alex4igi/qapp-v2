# Migrații pregătite, neaplicate

Nu intră în `supabase db push` (sunt în afara lui `migrations/`). Se aplică manual,
prin MCP `apply_migration`, apoi fișierul se mută în `migrations/` cu versiunea dată de server.

- `rls_teacher_pe_grupa.sql` — 4.6 / Faza 3: instructorul vede doar ce ține de grupele lui.
  Testat 2026-09-25 într-o tranzacție anulată: celelalte roluri neschimbate (cifre + timpi),
  instructorul vede exact elevii/leadurile lui, zero date interzise. Se aplică DIMINEAȚA
  (nu 16:30–22:00, când se fac prezențe).
- `revenire_rls_teacher_pe_grupa.sql` — revenirea, dacă filtrul blochează ceva.
