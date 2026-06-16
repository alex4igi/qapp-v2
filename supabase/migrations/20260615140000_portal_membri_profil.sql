-- Portal membri — FIȘĂ EDITABILĂ (self-service date contact + preferințe + date firmă).
-- Citire/scriere prin RPC SECURITY DEFINER scopate strict la contul `parinte` curent.

-- ============================================================
-- 1) Date juridice firmă pe familii (pentru factură pe firmă)
-- ============================================================
alter table familii add column if not exists factura_pe_firma boolean not null default false;
alter table familii add column if not exists firma_denumire text;
alter table familii add column if not exists firma_cif text;
alter table familii add column if not exists firma_reg_com text;
alter table familii add column if not exists firma_adresa text;
alter table familii add column if not exists firma_banca text;
alter table familii add column if not exists firma_iban text;

-- ============================================================
-- 2) Profil familie (reprezentant + contact + marketing + poze + firmă)
-- ============================================================
create or replace function get_profil_familie()
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
         f.opt_out_marketing, f.doreste_sa_apara_in_poze,
         f.factura_pe_firma, f.firma_denumire, f.firma_cif, f.firma_reg_com,
         f.firma_adresa, f.firma_banca, f.firma_iban
  from familii f
  where f.auth_user_id = auth.uid();
$$;

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

-- ============================================================
-- 3) Profil membru (date contact editabile; identitate read-only)
-- ============================================================
create or replace function get_profil_client(p_client uuid)
returns table (
  client_id uuid,
  nume text,
  prenume text,
  data_nasterii date,
  email text,
  telefon text,
  telefonul_2 text,
  marime_tricou text,
  unitate_invatamant text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.nume, c.prenume, c.data_nasterii::date, c.email, c.telefon,
         c.telefonul_2, c.marime_tricou::text, c.unitate_invatamant
  from clienti c
  where c.id = p_client and c.id in (select client_member_ids());
$$;

-- Editabil de client: doar contact + mărime tricou + școală.
-- Nume/data nașterii rămân read-only (corecții prin recepție) — anti-abuz.
create or replace function update_profil_client(
  p_client             uuid,
  p_email              text default null,
  p_telefon            text default null,
  p_telefonul_2        text default null,
  p_marime_tricou      text default null,
  p_unitate_invatamant text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_parinte() then raise exception 'Acces refuzat.'; end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'Membru în afara familiei.';
  end if;

  update clienti set
    email              = p_email,
    telefon            = p_telefon,
    telefonul_2        = p_telefonul_2,
    marime_tricou      = nullif(p_marime_tricou, '')::marime_tricou,
    unitate_invatamant = p_unitate_invatamant
  where id = p_client;
end;
$$;

grant execute on function get_profil_familie() to authenticated;
grant execute on function update_profil_familie(text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,text) to authenticated;
grant execute on function get_profil_client(uuid) to authenticated;
grant execute on function update_profil_client(uuid,text,text,text,text,text) to authenticated;
