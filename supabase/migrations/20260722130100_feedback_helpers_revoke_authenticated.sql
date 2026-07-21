-- `_luni_achitate_curs` și `_sezon_curs_inchis` sunt helper-e interne, chemate doar din
-- `get_ratable_activities_client` / `submit_rating_client` (funcții definer, deținute de
-- postgres — ownerul are execute oricum, deci revocarea nu le afectează).
--
-- Migrația 20260722130000 a revocat doar `anon, public`, dar default privileges Supabase
-- acordă EXECUTE explicit și lui `authenticated`, iar un revoke de pe PUBLIC nu atinge un
-- grant nominal. Fiind `security definer`, ele ocolesc RLS: un cont de portal ar fi putut
-- apela `_luni_achitate_curs(<alt client>, <alt curs>)` și afla dacă alt copil și-a achitat
-- lunile. Scurgere mică, dar exact clasa de bug pentru care există regula de revoke.
--
-- `check-anon-rpc.mjs` nu prinde asta — verifică doar rolul anon.

revoke execute on function _luni_achitate_curs(uuid, uuid) from authenticated;
revoke execute on function _sezon_curs_inchis(uuid) from authenticated;
