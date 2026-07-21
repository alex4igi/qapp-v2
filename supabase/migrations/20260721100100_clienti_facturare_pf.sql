-- Facturare „la cerere" per client: date de facturare alternative PF (alt nume + CNP + adresă)
-- + marcaj „vrea factură lunară" cu dată de activare (doar încasările de la activare încolo
-- intră în worklist-ul „De facturat" din /facturare).

alter table clienti
  add column if not exists factura_lunara       boolean not null default false,
  add column if not exists factura_lunara_de_la date,
  add column if not exists facturare_pf_nume    text,
  add column if not exists facturare_pf_cnp     text,
  add column if not exists facturare_pf_adresa  text;

-- ============================================================
-- Profil membru (portal): expune + editează câmpurile noi.
-- DROP + CREATE obligatoriu (semnături schimbate) — altfel rămâne un overload
-- vechi și PostgREST nu mai poate rezolva apelul.
-- ============================================================

drop function if exists get_profil_client(uuid);
create function get_profil_client(p_client uuid)
returns table (
  client_id uuid,
  nume text,
  prenume text,
  data_nasterii date,
  email text,
  telefon text,
  telefonul_2 text,
  marime_tricou text,
  unitate_invatamant text,
  factura_lunara boolean,
  factura_lunara_de_la date,
  facturare_pf_nume text,
  facturare_pf_cnp text,
  facturare_pf_adresa text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.nume, c.prenume, c.data_nasterii::date, c.email, c.telefon,
         c.telefonul_2, c.marime_tricou::text, c.unitate_invatamant,
         c.factura_lunara, c.factura_lunara_de_la,
         c.facturare_pf_nume, c.facturare_pf_cnp, c.facturare_pf_adresa
  from clienti c
  where c.id = p_client and c.id in (select client_member_ids());
$$;

-- Câmpurile de facturare folosesc semantica „null = neatins, '' = șterge" ca un bundle
-- de portal vechi (fără parametrii noi) să nu poată goli datele introduse de recepție.
drop function if exists update_profil_client(uuid,text,text,text,text,text);
create function update_profil_client(
  p_client              uuid,
  p_email               text default null,
  p_telefon             text default null,
  p_telefonul_2         text default null,
  p_marime_tricou       text default null,
  p_unitate_invatamant  text default null,
  p_facturare_pf_nume   text default null,
  p_facturare_pf_cnp    text default null,
  p_facturare_pf_adresa text default null,
  p_factura_lunara      boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_parinte() then raise exception 'Acces refuzat.'; end if;
  if p_client not in (select client_member_ids()) then
    raise exception 'Membru în afara familiei.';
  end if;
  if nullif(btrim(coalesce(p_facturare_pf_cnp, '')), '') is not null
     and btrim(p_facturare_pf_cnp) !~ '^\d{13}$' then
    raise exception 'CNP invalid (13 cifre).';
  end if;

  update clienti set
    email               = p_email,
    telefon             = p_telefon,
    telefonul_2         = p_telefonul_2,
    marime_tricou       = nullif(p_marime_tricou, '')::marime_tricou,
    unitate_invatamant  = p_unitate_invatamant,
    facturare_pf_nume   = case when p_facturare_pf_nume   is null then facturare_pf_nume
                               else nullif(btrim(p_facturare_pf_nume), '') end,
    facturare_pf_cnp    = case when p_facturare_pf_cnp    is null then facturare_pf_cnp
                               else nullif(btrim(p_facturare_pf_cnp), '') end,
    facturare_pf_adresa = case when p_facturare_pf_adresa is null then facturare_pf_adresa
                               else nullif(btrim(p_facturare_pf_adresa), '') end,
    factura_lunara      = coalesce(p_factura_lunara, factura_lunara),
    factura_lunara_de_la = case
                             when p_factura_lunara is true and factura_lunara is distinct from true then current_date
                             when p_factura_lunara is false then null
                             else factura_lunara_de_la end
  where id = p_client;
end;
$$;

grant execute on function get_profil_client(uuid) to authenticated;
grant execute on function update_profil_client(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;
revoke execute on function get_profil_client(uuid) from anon, public;
revoke execute on function update_profil_client(uuid,text,text,text,text,text,text,text,text,boolean) from anon, public;
