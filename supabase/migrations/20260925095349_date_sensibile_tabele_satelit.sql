-- 4.6 / Faza 0a: datele sensibile ies din clienti / familii / teacheri în tabele
-- satelit, doar pentru staff.
--
-- De ce: RLS-ul filtrează rânduri, nu coloane, iar instructorul și recepția au
-- același rol Postgres (`authenticated`). Singurul mod de a-i arăta unui instructor
-- rândul elevului FĂRĂ CNP-ul de facturare, IBAN-ul familiei sau modelul salarial
-- al unui coleg e ca aceste coloane să stea în alt tabel, pe care el nu-l vede.
--
-- Etapa asta doar creează sateliții și îi umple. Coloanele vechi rămân (și sunt
-- oglindite în satelit de un trigger) cât timp codul vechi mai rulează în browsere;
-- le șterge Faza 0c, după publicarea codului care citește din sateliți.

-- ── clienti_facturare ──────────────────────────────────────────────────────────
create table public.clienti_facturare (
  client_id           uuid primary key references public.clienti(id) on delete cascade,
  facturare_pf_nume   text,
  facturare_pf_cnp    text,
  facturare_pf_adresa text,
  updated             timestamptz not null default now()
);

-- ── familii_facturare ──────────────────────────────────────────────────────────
create table public.familii_facturare (
  familie_id     uuid primary key references public.familii(id) on delete cascade,
  firma_denumire text,
  firma_cif      text,
  firma_reg_com  text,
  firma_adresa   text,
  firma_banca    text,
  firma_iban     text,
  observatii     text,
  updated        timestamptz not null default now()
);

-- ── teacheri_detalii ───────────────────────────────────────────────────────────
create table public.teacheri_detalii (
  teacher_id    uuid primary key references public.teacheri(id) on delete cascade,
  data_nasterii date,
  telefon       text,
  email         text,
  link_contract text,
  observatii    text,
  marime_tricou public.marime_tricou,
  model_salariu text,
  updated       timestamptz not null default now()
);

create trigger trg_clienti_facturare_updated before update on public.clienti_facturare
  for each row execute function set_updated_timestamp();
create trigger trg_familii_facturare_updated before update on public.familii_facturare
  for each row execute function set_updated_timestamp();
create trigger trg_teacheri_detalii_updated before update on public.teacheri_detalii
  for each row execute function set_updated_timestamp();

-- ── Umplere ────────────────────────────────────────────────────────────────────
insert into public.clienti_facturare (client_id, facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa)
select id, facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa
from public.clienti
where coalesce(facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa) is not null;

insert into public.familii_facturare
  (familie_id, firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban, observatii)
select id, firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban, observatii
from public.familii
where coalesce(firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban, observatii) is not null;

insert into public.teacheri_detalii
  (teacher_id, data_nasterii, telefon, email, link_contract, observatii, marime_tricou, model_salariu)
select id, data_nasterii, telefon, email, link_contract, observatii, marime_tricou, model_salariu
from public.teacheri;

-- ── Oglindire temporară (se șterge în Faza 0c) ────────────────────────────────
-- Codul vechi, încă deschis în browsere, scrie în coloanele vechi; triggerul duce
-- valoarea și în satelit, ca nimic să nu se piardă până la publicarea codului nou.
create function public._oglinda_clienti_facturare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.facturare_pf_nume, new.facturare_pf_cnp, new.facturare_pf_adresa) is not null
     or exists (select 1 from clienti_facturare where client_id = new.id) then
    insert into clienti_facturare (client_id, facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa)
    values (new.id, new.facturare_pf_nume, new.facturare_pf_cnp, new.facturare_pf_adresa)
    on conflict (client_id) do update set
      facturare_pf_nume = excluded.facturare_pf_nume,
      facturare_pf_cnp = excluded.facturare_pf_cnp,
      facturare_pf_adresa = excluded.facturare_pf_adresa;
  end if;
  return null;
end $$;

create trigger trg_oglinda_clienti_facturare
  after insert or update of facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa on public.clienti
  for each row execute function public._oglinda_clienti_facturare();

create function public._oglinda_familii_facturare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.firma_denumire, new.firma_cif, new.firma_reg_com, new.firma_adresa,
              new.firma_banca, new.firma_iban, new.observatii) is not null
     or exists (select 1 from familii_facturare where familie_id = new.id) then
    insert into familii_facturare
      (familie_id, firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban, observatii)
    values (new.id, new.firma_denumire, new.firma_cif, new.firma_reg_com, new.firma_adresa,
            new.firma_banca, new.firma_iban, new.observatii)
    on conflict (familie_id) do update set
      firma_denumire = excluded.firma_denumire, firma_cif = excluded.firma_cif,
      firma_reg_com = excluded.firma_reg_com, firma_adresa = excluded.firma_adresa,
      firma_banca = excluded.firma_banca, firma_iban = excluded.firma_iban,
      observatii = excluded.observatii;
  end if;
  return null;
end $$;

create trigger trg_oglinda_familii_facturare
  after insert or update of firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban, observatii
  on public.familii
  for each row execute function public._oglinda_familii_facturare();

create function public._oglinda_teacheri_detalii() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into teacheri_detalii
    (teacher_id, data_nasterii, telefon, email, link_contract, observatii, marime_tricou, model_salariu)
  values (new.id, new.data_nasterii, new.telefon, new.email, new.link_contract, new.observatii,
          new.marime_tricou, new.model_salariu)
  on conflict (teacher_id) do update set
    data_nasterii = excluded.data_nasterii, telefon = excluded.telefon, email = excluded.email,
    link_contract = excluded.link_contract, observatii = excluded.observatii,
    marime_tricou = excluded.marime_tricou, model_salariu = excluded.model_salariu;
  return null;
end $$;

create trigger trg_oglinda_teacheri_detalii
  after insert or update of data_nasterii, telefon, email, link_contract, observatii, marime_tricou, model_salariu
  on public.teacheri
  for each row execute function public._oglinda_teacheri_detalii();

-- Funcțiile de trigger nu se cheamă prin API.
revoke execute on function public._oglinda_clienti_facturare() from public, anon, authenticated;
revoke execute on function public._oglinda_familii_facturare() from public, anon, authenticated;
revoke execute on function public._oglinda_teacheri_detalii() from public, anon, authenticated;

-- ── Drepturi + RLS ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.clienti_facturare, public.familii_facturare,
  public.teacheri_detalii to authenticated;
grant all on public.clienti_facturare, public.familii_facturare, public.teacheri_detalii to service_role;

alter table public.clienti_facturare enable row level security;
alter table public.familii_facturare enable row level security;
alter table public.teacheri_detalii enable row level security;

-- Aceleași roluri care scriu azi coloanele în tabelul-mamă.
create policy clienti_facturare_staff on public.clienti_facturare for all to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'));

create policy familii_facturare_staff on public.familii_facturare for all to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'));

-- Recepția vedea deja telefonul/emailul instructorilor (pagina /teacheri); scrierea
-- rămâne la manager+ ca pe `teacheri`. Instructorul își vede doar propriul rând.
create policy teacheri_detalii_staff_select on public.teacheri_detalii for select to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager', 'front_desk'));
create policy teacheri_detalii_self_select on public.teacheri_detalii for select to authenticated
  using (teacher_id = (select my_teacher_id()));
create policy teacheri_detalii_write on public.teacheri_detalii for all to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager'));

-- Garduri obligatorii pe tabel nou (vezi CLAUDE.md): portal și agenție = refuz total.
do $$
declare t text;
begin
  foreach t in array array['clienti_facturare', 'familii_facturare', 'teacheri_detalii'] loop
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'parinte', 'parinte');
    execute format(
      'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'marketing', 'marketing');
  end loop;
end $$;

-- ── Funcțiile care citesc/scriu coloanele mutate ───────────────────────────────
create or replace function public.get_profil_client(p_client uuid)
 returns table(client_id uuid, nume text, prenume text, data_nasterii date, email text, telefon text,
               telefonul_2 text, marime_tricou text, unitate_invatamant text, factura_lunara boolean,
               factura_lunara_de_la date, facturare_pf_nume text, facturare_pf_cnp text,
               facturare_pf_adresa text)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.id, c.nume, c.prenume, c.data_nasterii::date, c.email, c.telefon,
         c.telefonul_2, c.marime_tricou::text, c.unitate_invatamant,
         c.factura_lunara, c.factura_lunara_de_la,
         cf.facturare_pf_nume, cf.facturare_pf_cnp, cf.facturare_pf_adresa
  from clienti c
  left join clienti_facturare cf on cf.client_id = c.id
  where c.id = p_client and c.id in (select client_member_ids());
$function$;

create or replace function public.update_profil_client(p_client uuid, p_email text default null::text,
  p_telefon text default null::text, p_telefonul_2 text default null::text,
  p_marime_tricou text default null::text, p_unitate_invatamant text default null::text,
  p_facturare_pf_nume text default null::text, p_facturare_pf_cnp text default null::text,
  p_facturare_pf_adresa text default null::text, p_factura_lunara boolean default null::boolean)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
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
    factura_lunara      = coalesce(p_factura_lunara, factura_lunara),
    factura_lunara_de_la = case
                             when p_factura_lunara is true and factura_lunara is distinct from true then current_date
                             when p_factura_lunara is false then null
                             else factura_lunara_de_la end
  where id = p_client;

  if coalesce(p_facturare_pf_nume, p_facturare_pf_cnp, p_facturare_pf_adresa) is not null then
    insert into clienti_facturare as cf (client_id, facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa)
    values (p_client,
            nullif(btrim(p_facturare_pf_nume), ''),
            nullif(btrim(p_facturare_pf_cnp), ''),
            nullif(btrim(p_facturare_pf_adresa), ''))
    on conflict (client_id) do update set
      facturare_pf_nume   = case when p_facturare_pf_nume   is null then cf.facturare_pf_nume
                                 else nullif(btrim(p_facturare_pf_nume), '') end,
      facturare_pf_cnp    = case when p_facturare_pf_cnp    is null then cf.facturare_pf_cnp
                                 else nullif(btrim(p_facturare_pf_cnp), '') end,
      facturare_pf_adresa = case when p_facturare_pf_adresa is null then cf.facturare_pf_adresa
                                 else nullif(btrim(p_facturare_pf_adresa), '') end;
  end if;
end;
$function$;

create or replace function public.get_profil_familie()
 returns table(familie_id uuid, nume_familie text, nume_reprezentant text, prenume_reprezentant text,
               telefon text, telefon_2 text, email text, metoda_comunicare text,
               opt_out_marketing boolean, doreste_sa_apara_in_poze boolean, fara_poze boolean,
               factura_pe_firma boolean, firma_denumire text, firma_cif text, firma_reg_com text,
               firma_adresa text, firma_banca text, firma_iban text)
 language sql stable security definer set search_path to 'public'
as $function$
  select f.id, f.nume_familie, f.nume_reprezentant, f.prenume_reprezentant,
         f.telefon, f.telefon_2, f.email, f.metoda_comunicare,
         f.opt_out_marketing, f.doreste_sa_apara_in_poze, f.fara_poze,
         f.factura_pe_firma, ff.firma_denumire, ff.firma_cif, ff.firma_reg_com,
         ff.firma_adresa, ff.firma_banca, ff.firma_iban
  from familii f
  left join familii_facturare ff on ff.familie_id = f.id
  where f.auth_user_id = auth.uid();
$function$;

create or replace function public.update_profil_familie(p_nume_reprezentant text default null::text,
  p_prenume_reprezentant text default null::text, p_telefon text default null::text,
  p_telefon_2 text default null::text, p_email text default null::text,
  p_metoda_comunicare text default null::text, p_opt_out_marketing boolean default null::boolean,
  p_doreste_poze boolean default null::boolean, p_factura_pe_firma boolean default null::boolean,
  p_firma_denumire text default null::text, p_firma_cif text default null::text,
  p_firma_reg_com text default null::text, p_firma_adresa text default null::text,
  p_firma_banca text default null::text, p_firma_iban text default null::text)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
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
    factura_pe_firma        = coalesce(p_factura_pe_firma, factura_pe_firma)
  where id = v_fam;

  -- Portalul trimite mereu tot formularul, deci suprascrie (ca înainte).
  insert into familii_facturare as ff
    (familie_id, firma_denumire, firma_cif, firma_reg_com, firma_adresa, firma_banca, firma_iban)
  values (v_fam, p_firma_denumire, p_firma_cif, p_firma_reg_com, p_firma_adresa, p_firma_banca, p_firma_iban)
  on conflict (familie_id) do update set
    firma_denumire = excluded.firma_denumire, firma_cif = excluded.firma_cif,
    firma_reg_com = excluded.firma_reg_com, firma_adresa = excluded.firma_adresa,
    firma_banca = excluded.firma_banca, firma_iban = excluded.firma_iban;
end;
$function$;

-- calculeaza_salariu_teacher și get_titulari_kpi: o singură linie fiecare, schimbată
-- pe definiția LIVE (nu rescrise din migrații vechi).
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.calculeaza_salariu_teacher(uuid,integer,integer)'::regprocedure);
  if position('select model_salariu into v_model from teacheri where id = p_teacher;' in v_def) = 0 then
    raise exception 'calculeaza_salariu_teacher: linia model_salariu nu mai arată cum mă aștept';
  end if;
  execute replace(v_def,
    'select model_salariu into v_model from teacheri where id = p_teacher;',
    'select model_salariu into v_model from teacheri_detalii where teacher_id = p_teacher;');

  v_def := pg_get_functiondef('public.get_titulari_kpi(boolean)'::regprocedure);
  if (length(v_def) - length(replace(v_def, E'         t.email,\n', ''))) <> length(E'         t.email,\n') then
    raise exception 'get_titulari_kpi: t.email nu apare exact o dată';
  end if;
  execute replace(v_def, E'         t.email,\n',
    E'         (select d.email from teacheri_detalii d where d.teacher_id = t.id),\n');
end $$;

-- ── View-urile care expuneau coloanele mutate ──────────────────────────────────
-- Aceleași coloane, în aceeași ordine; valorile vin acum din sateliți, deci sub RLS
-- un instructor nu mai vede telefonul colegilor prin lista de cursuri.
create or replace view public.lista_cursuri with (security_invoker = true) as
 select c.id,
    c.numele as numele_cursului,
    c.sezon,
    c.zile,
    c.nivelul,
    c.varsta,
    c.facultativ,
    c.ora,
    c.ore_pe_zi,
    os.ore_start,
    os.ore_start[1] as ora_start,
    coalesce(act.inscrisi, (0)::bigint) as inscrisi,
    c.capacitate_maxima,
    i.id as id_teacher,
    i.nume,
    i.prenume,
    td.telefon,
    i.nivelul as nivel_teacher,
    s.nume as sala,
    coalesce(l_direct.nume, l_sala.nume) as locatie,
    coalesce(c.locatie, s.locatie) as id_locatie,
    0 as balance
   from cursuri c
     left join teacheri i on c.teacher = i.id
     left join teacheri_detalii td on td.teacher_id = i.id
     left join sali s on s.id = c.sala
     left join locatii l_sala on l_sala.id = s.locatie
     left join locatii l_direct on l_direct.id = c.locatie
     left join lateral ( select (lo.ocupate)::bigint as inscrisi
           from locuri_ocupate(current_date, current_date, array[c.id]) lo(curs_id, ocupate)) act on true
     left join lateral ( select coalesce(array_agg(distinct x.h order by x.h) filter (where x.h is not null),
                case
                    when c.ora is null then null::text[]
                    else array[c.ora]
                end) as ore_start
           from unnest(coalesce(c.zile, '{}'::zi_saptamana[])) z(z)
             cross join lateral ( select coalesce((c.ore_pe_zi ->> (z.z)::text), c.ora) as h) x) os on true;

create or replace view public.profil_teacher with (security_invoker = true) as
 select t.id,
    t.prenume,
    t.nume,
    td.telefon,
    td.email,
    td.data_nasterii,
    td.link_contract,
    td.marime_tricou,
    t.nivelul,
    td.observatii,
    t.poza,
    string_agg((c.id)::text, ','::text) as cursuri
   from teacheri t
     left join teacheri_detalii td on td.teacher_id = t.id
     left join cursuri c on c.teacher = t.id
  group by t.id, td.teacher_id;

create or replace view public.lista_familii with (security_invoker = true) as
 select f.id,
    f.nume_familie,
    f.nume_reprezentant,
    f.prenume_reprezentant,
    f.email,
    f.telefon,
    f.telefon_2,
    ff.observatii,
    string_agg(((c.nume || ' '::text) || coalesce(c.prenume, ''::text)), ','::text) as membri
   from familii f
     left join familii_facturare ff on ff.familie_id = f.id
     left join clienti c on c.familia = f.id
  group by f.id, ff.familie_id;
