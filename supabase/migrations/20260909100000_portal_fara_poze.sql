-- Portalul membri: întrebarea despre imagine devine explicită (Da / Nu / fără răspuns).
--
-- Până acum portalul avea o bifă „Sunt de acord cu apariția în poze/video" legată de
-- `doreste_sa_apara_in_poze`. Bifa nescoasă și bifa niciodată atinsă arătau identic,
-- iar un părinte care salva formularul fără s-o atingă trimitea `false` — adică
-- exact ce nu se poate distinge de un refuz. De aceea flagul nu putea alimenta
-- iconița „fără poze" din rosterul grupei (vezi 20260908220000_fara_poze_gdpr.sql).
--
-- Acum răspunsul e tri-stare, iar portalul îl trimite DOAR când părintele îl dă:
--   p_doreste_poze = true  → acord   → doreste_sa_apara_in_poze = true,  fara_poze = false
--   p_doreste_poze = false → refuz   → doreste_sa_apara_in_poze = false, fara_poze = true
--   p_doreste_poze = null  → neatins → nu schimbă nimic
-- Portalul citește ambele coloane ca să știe dacă întrebarea a primit vreun răspuns.

-- Tipul returnat se schimbă (coloană nouă) → CREATE OR REPLACE nu e suficient.
drop function if exists get_profil_familie();

create function get_profil_familie()
returns table (
  familie_id uuid,
  nume_familie text,
  nume_reprezentant text,
  prenume_reprezentant text,
  telefon text,
  telefon_2 text,
  email text,
  metoda_comunicare text,
  opt_out_marketing boolean,
  doreste_sa_apara_in_poze boolean,
  fara_poze boolean,
  factura_pe_firma boolean,
  firma_denumire text,
  firma_cif text,
  firma_reg_com text,
  firma_adresa text,
  firma_banca text,
  firma_iban text
)
language sql stable security definer set search_path = public as $$
  select f.id, f.nume_familie, f.nume_reprezentant, f.prenume_reprezentant,
         f.telefon, f.telefon_2, f.email, f.metoda_comunicare,
         f.opt_out_marketing, f.doreste_sa_apara_in_poze, f.fara_poze,
         f.factura_pe_firma, f.firma_denumire, f.firma_cif, f.firma_reg_com,
         f.firma_adresa, f.firma_banca, f.firma_iban
  from familii f
  where f.auth_user_id = auth.uid();
$$;

grant execute on function get_profil_familie() to authenticated;
revoke execute on function get_profil_familie() from anon, public;

create or replace function update_profil_familie(
  p_nume_reprezentant      text default null,
  p_prenume_reprezentant   text default null,
  p_telefon                text default null,
  p_telefon_2              text default null,
  p_email                  text default null,
  p_metoda_comunicare      text default null,
  p_opt_out_marketing      boolean default null,
  p_doreste_poze           boolean default null,
  p_factura_pe_firma       boolean default null,
  p_firma_denumire         text default null,
  p_firma_cif              text default null,
  p_firma_reg_com          text default null,
  p_firma_adresa           text default null,
  p_firma_banca            text default null,
  p_firma_iban             text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_fam uuid;
begin
  if not is_parinte() then raise exception 'Acces refuzat.'; end if;
  select id into v_fam from familii where auth_user_id = auth.uid();
  if v_fam is null then raise exception 'Contul nu e legat de o familie.'; end if;

  update familii set
    nume_reprezentant       = p_nume_reprezentant,
    prenume_reprezentant    = p_prenume_reprezentant,
    telefon                 = p_telefon,
    telefon_2               = p_telefon_2,
    email                   = p_email,
    metoda_comunicare       = p_metoda_comunicare,
    opt_out_marketing       = coalesce(p_opt_out_marketing, opt_out_marketing),
    opt_out_la              = case
                                when p_opt_out_marketing is true and opt_out_marketing is distinct from true then now()
                                when p_opt_out_marketing is false then null
                                else opt_out_la end,
    doreste_sa_apara_in_poze = coalesce(p_doreste_poze, doreste_sa_apara_in_poze),
    -- Refuzul explicit al părintelui e aceeași sursă de adevăr ca Anexa 2 din
    -- contract; ambele scriu `fara_poze`, iar cine răspunde ultimul are dreptate.
    fara_poze               = case when p_doreste_poze is null then fara_poze
                                   else not p_doreste_poze end,
    factura_pe_firma        = coalesce(p_factura_pe_firma, factura_pe_firma),
    firma_denumire          = p_firma_denumire,
    firma_cif               = p_firma_cif,
    firma_reg_com           = p_firma_reg_com,
    firma_adresa            = p_firma_adresa,
    firma_banca             = p_firma_banca,
    firma_iban              = p_firma_iban
  where id = v_fam;
end;
$$;

revoke execute on function update_profil_familie(text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,text) from anon, public;
