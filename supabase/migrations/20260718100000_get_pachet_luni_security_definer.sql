-- PERFORMANȚĂ — get_pachet_luni pe SECURITY DEFINER (dashboard „Pachetul de luni").
--
-- Simptom: /analytics dădea 500 pe get_pachet_luni DOAR pe „Toate locațiile"
-- (p_locatie = NULL). Cauza: statement_timeout (rolul authenticated = 8s), nu bug
-- de logică. Funcția e grea (11× clienti_activi_la, subquery-uri corelate sum(incasari)
-- per înrolare, ×3 ferestre) și, fiind `security invoker`, rula cu RLS aplicat pe
-- FIECARE tabel din interior → ~5.6× overhead. Măsurat pe „Toate locațiile":
--   0.6s fără RLS (postgres)  vs  3.3s cu RLS (authenticated, cache cald)  vs
--   >8s la cache rece + ~10 RPC-uri concurente ale panoului → timeout → 500.
-- Cu o locație selectată filtrele tăiau rândurile din start, deci mergea.
--
-- Fix: SECURITY DEFINER → rulează ca owner, RLS ocolit → ~0.6s (comod sub 8s).
-- Sigur pentru că funcția se termină DEJA cu `... where is_admin()` — autorizarea NU
-- depinde de RLS, ci de acest gard, deci doar adminii primesc date (anon/non-admin →
-- gol, ca înainte). Verificat empiric: output IDENTIC invoker-sub-RLS vs definer-fără-RLS,
-- atât pe NULL cât și pe o locație (politicile RLS de admin dădeau oricum vizibilitate
-- totală). Nu atingem corpul funcției — doar atributul de securitate.
--
-- Revocăm anon/public (convenția din auditul 2026-07-17: RPC-urile definer nu sunt
-- apelabile de anon); authenticated păstrează grant direct → staff neafectat.

alter function public.get_pachet_luni(uuid) security definer;

revoke execute on function public.get_pachet_luni(uuid) from anon, public;
grant execute on function public.get_pachet_luni(uuid) to authenticated;
