-- Audit securitate 2026-09-20 — view-uri SECURITY DEFINER citibile cu cheia publică.
--
-- `datorii_rest` și `opt_out_list` erau view-uri obișnuite (implicit SECURITY DEFINER:
-- rulează cu drepturile owner-ului `postgres`, care ocolește RLS) și aveau grant SELECT pe
-- `anon` din default privileges. Verificat cu cheia anon, fără login:
--   GET /rest/v1/opt_out_list → 5.934 rânduri (nume, email, telefon)
--   GET /rest/v1/datorii_rest → restanțe cu nume/prenume client
-- Fix: `security_invoker = true` (RLS-ul tabelelor de bază se aplică apelantului: staff
-- vede ca înainte, parinte/marketing/anon nu) + revocat anon.
--
-- `bilete_publice` / `produse_publice` sunt intenționat publice (portal /servicii, fără
-- login) și rămân definer pentru citire. Dar erau AUTO-UPDATABLE și aveau INSERT/UPDATE/
-- DELETE pe anon → oricine putea modifica/șterge evenimentele și produsele publice din
-- `evenimente`/`inventar`, ocolind RLS. Revocăm orice drept de scriere.

alter view public.datorii_rest set (security_invoker = true);
alter view public.opt_out_list set (security_invoker = true);

revoke all on public.datorii_rest from anon, public;
revoke all on public.opt_out_list from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.datorii_rest, public.opt_out_list from authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.bilete_publice, public.produse_publice from anon, authenticated, public;

comment on view public.datorii_rest is
  'security_invoker: RLS-ul de pe datorii/incasari/clienti se aplică apelantului. Fără acces anon.';
comment on view public.opt_out_list is
  'security_invoker: RLS-ul de pe clienti/leads se aplică apelantului. Fără acces anon.';
