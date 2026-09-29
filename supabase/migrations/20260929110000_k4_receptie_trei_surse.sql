-- K4 la recepție („răspuns la cereri"), decis de Alex pe 28–29 sept. 2026:
--   • rata = media simplă a surselor cu date în lună:
--       1. leadurile din aplicație — automat: cât din cererile noi ale lunii a atins un om
--          în termenul de prim apel, pe programul de lucru al recepției;
--       2. telefonul — apelurile pierdute și cele sunate înapoi, notate zilnic de recepție
--          în /situatie-zilnica (tabelul nou `apeluri_pierdute_zi`);
--   • Meta (Messenger, DM Instagram, comentarii) NU intră ca procent: statistica Meta numără
--     doar o parte din conversații („Conversations started" = 0 în septembrie, cu inboxul
--     plin). Managerul numără săptămânal, cumulat pe lună, ce a rămas fără răspuns peste
--     24 h (`meta_omise`); peste toleranță (5/lună) K4 coboară o treaptă. Doar pe grila
--     celui care răspunde în Meta (`include_meta` = 1: Petruța);
--   • managerul bifează că a verificat notările de telefon cu istoricul de apeluri
--     (`telefon_verificat`); fără bifă (și fără `meta_omise`, unde se cere) K4 e necompletat:
--     contează 0 și blochează închiderea lunii.
-- O sursă fără date nu intră în medie; fără nicio sursă, linia cade pe „fără date =
-- standard". Șablonul MOA (K4 fără `rata_peste`) rămâne pe `kpi_k4`, neatins.
-- Tot aici: recepția nu folosește zile lucrate / pro-rata (`zile_min_evaluare` = 0).

-- ── 1. Apelurile pierdute, pe zi și locație ───────────────────────────────────
create table public.apeluri_pierdute_zi (
  locatie_id   uuid not null references public.locatii(id),
  zi           date not null,
  pierdute     int  not null check (pierdute >= 0),
  returnate    int  not null check (returnate >= 0),
  completat_de uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (locatie_id, zi),
  constraint apeluri_returnate_max check (returnate <= pierdute)
);

alter table public.apeluri_pierdute_zi enable row level security;

revoke all on public.apeluri_pierdute_zi from anon, authenticated, public;
grant select, insert, update, delete on public.apeluri_pierdute_zi to authenticated;
grant all on public.apeluri_pierdute_zi to service_role;

create policy apeluri_pierdute_zi_select on public.apeluri_pierdute_zi
  for select to authenticated using (true);
create policy apeluri_pierdute_zi_insert on public.apeluri_pierdute_zi
  for insert to authenticated with check (true);
create policy apeluri_pierdute_zi_update on public.apeluri_pierdute_zi
  for update to authenticated using (true) with check (true);

create policy deny_parinte_direct on public.apeluri_pierdute_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.apeluri_pierdute_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.apeluri_pierdute_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

create or replace function public.trg_apeluri_pierdute_zi_atins() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.completat_de := coalesce(auth.uid(), new.completat_de);
  return new;
end;
$$;
revoke execute on function public.trg_apeluri_pierdute_zi_atins() from anon, authenticated, public;

create trigger trg_apeluri_pierdute_zi_atins before insert or update on public.apeluri_pierdute_zi
  for each row execute function public.trg_apeluri_pierdute_zi_atins();

-- ── 2. Termenul de răspuns pe programul recepției ─────────────────────────────
-- Aceeași regulă ca `lead_termen_primul_apel` (azi până la 23:59, după 18:00 → mâine
-- 12:00), dar „mâine" = următoarea zi de lucru. 5 = luni–vineri (Petruța), 7 = toată
-- săptămâna (Theo). Un lead de vineri seara sau din weekend are termen luni la 12:00.
create or replace function public.lead_termen_raspuns(p_created timestamptz, p_zile_lucru int)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local timestamp := p_created at time zone 'Europe/Bucharest';
  v_zi    date := v_local::date;
  v_zile  int := least(greatest(coalesce(p_zile_lucru, 7), 1), 7);
begin
  if v_zile = 7 then
    return lead_termen_primul_apel(p_created);
  end if;
  if extract(isodow from v_zi) <= v_zile and extract(hour from v_local) < 18 then
    return (v_zi + time '23:59:59') at time zone 'Europe/Bucharest';
  end if;
  v_zi := v_zi + 1;
  while extract(isodow from v_zi) > v_zile loop
    v_zi := v_zi + 1;
  end loop;
  return (v_zi + time '12:00') at time zone 'Europe/Bucharest';
end;
$$;

revoke execute on function public.lead_termen_raspuns(timestamptz, int) from anon, public;
grant execute on function public.lead_termen_raspuns(timestamptz, int) to authenticated;

-- ── 3. K4 recepție ────────────────────────────────────────────────────────────
create or replace function public.kpi_k4_receptie(
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb,
  p_manual    jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_zile      int := coalesce((p_parametri ->> 'zile_lucru_saptamana')::int, 7);
  v_std       numeric := coalesce((p_parametri ->> 'rata_standard')::numeric, 85);
  v_peste     numeric := coalesce((p_parametri ->> 'rata_peste')::numeric, 95.01);
  v_cu_meta   boolean := coalesce((p_parametri ->> 'include_meta')::int, 0) = 1;
  v_toleranta int := coalesce((p_parametri ->> 'toleranta_meta')::int, 5);
  v_prima     date := make_date(p_anul, p_luna, 1);
  v_omise     int := nullif(p_manual ->> 'meta_omise', '')::int;
  v_tel_ok    boolean := coalesce((p_manual ->> 'telefon_verificat')::boolean, false);
  v_ld_numitor int; v_ld_termen int; v_ld_asteptare int; v_ld_fara_loc int;
  v_ld_rata   numeric;
  v_tel_zile  int; v_tel_pierdute int; v_tel_returnate int;
  v_tel_rata  numeric;
  v_rate      numeric[] := '{}';
  v_valoare   numeric;
  v_banda     text;
  v_coborat   boolean := false;
  v_lipsa     text[] := '{}';
begin
  with cereri as (
    select l.id, l.created,
           lead_termen_raspuns(l.created, v_zile) as termen,
           -- Locația: a leadului → a ultimei programări → a grupei la care s-a înscris.
           coalesce(
             l.locatie_id,
             (select pl.locatie from programari_leads pl
               where pl.lead = l.id and pl.locatie is not null
               order by pl.created desc limit 1),
             (select c.locatie from enrollments e join cursuri c on c.id = e.cursul
               where l.id_client is not null and e.client = l.id_client
                 and e.created >= l.created
               order by e.created limit 1)
           ) as locatie
    from leads l
    where (l.created at time zone 'Europe/Bucharest')::date >= v_prima
      and (l.created at time zone 'Europe/Bucharest')::date < (v_prima + interval '1 month')::date
      and coalesce(l.deja_client, false) = false
      -- Rândurile create direct în Nurture sunt foștii clienți puși în pool-ul de
      -- reactivare de `auto_mark_inactiv_si_exclient`, nu cereri la care să răspunzi.
      and not exists (select 1 from lead_history h
                       where h.lead_id = l.id and h.action_type = 'created'
                         and h.new_value = 'nurture')
  ),
  verdict as (
    select c.*,
           least(
             (select min(lc.created) from lead_contacte lc where lc.lead_id = c.id),
             (select min(h.created_at) from lead_history h
               where h.lead_id = c.id and h.user_id is not null
                 and h.action_type in ('created','status_change','sub_status_change','sms_sent','note_added'))
           ) as prima_atingere
    from cereri c
  )
  select count(*) filter (where locatie = any(p_locatii) and termen <= now()),
         count(*) filter (where locatie = any(p_locatii) and termen <= now() and prima_atingere <= termen),
         count(*) filter (where locatie = any(p_locatii) and termen > now()),
         count(*) filter (where locatie is null)
    into v_ld_numitor, v_ld_termen, v_ld_asteptare, v_ld_fara_loc
  from verdict;

  if v_ld_numitor > 0 then
    v_ld_rata := round(v_ld_termen::numeric / v_ld_numitor * 100, 1);
    v_rate := v_rate || v_ld_rata;
  end if;

  select count(*), coalesce(sum(pierdute), 0), coalesce(sum(returnate), 0)
    into v_tel_zile, v_tel_pierdute, v_tel_returnate
  from apeluri_pierdute_zi
  where locatie_id = any(p_locatii)
    and zi >= v_prima and zi < (v_prima + interval '1 month')::date;

  if v_tel_zile > 0 then
    -- Zile completate fără niciun apel pierdut = n-a lăsat pe nimeni nesunat.
    v_tel_rata := case when v_tel_pierdute = 0 then 100
                       else round(v_tel_returnate::numeric / v_tel_pierdute * 100, 1) end;
    v_rate := v_rate || v_tel_rata;
  end if;

  if cardinality(v_rate) > 0 then
    select round(avg(x), 1) into v_valoare from unnest(v_rate) x;
    v_banda := case when v_valoare >= v_peste then 'peste'
                    when v_valoare >= v_std then 'standard'
                    else 'sub' end;
    if v_cu_meta and v_omise > v_toleranta and v_banda <> 'sub' then
      v_banda := case v_banda when 'peste' then 'standard' else 'sub' end;
      v_coborat := true;
    end if;
  end if;

  if not v_tel_ok then
    v_lipsa := v_lipsa || 'bifa „am verificat telefonul"'::text;
  end if;
  if v_cu_meta and v_omise is null then
    v_lipsa := v_lipsa || 'numărul de mesaje și comentarii Meta fără răspuns'::text;
  end if;

  return jsonb_build_object(
    'kpi', 'raspuns_24h', 'mod', 'trei_surse',
    'valoare', v_valoare,
    -- Ce trebuie să completeze managerul lipsește: K4 contează 0 și blochează închiderea.
    'banda', case when cardinality(v_lipsa) > 0 then 'na'
                  when v_banda is null then 'na'
                  else v_banda end,
    'motiv', case when cardinality(v_lipsa) > 0 then 'necompletat'
                  when v_banda is null then 'numitor_zero' end,
    'motiv_text', case when cardinality(v_lipsa) > 0
                       then 'Managerul n-a completat: ' || array_to_string(v_lipsa, ', ') || '.'
                       when v_banda is null then 'Nicio sursă n-are date luna asta.' end,
    'banda_calculata', v_banda,
    'praguri', jsonb_build_object('standard', v_std, 'peste', v_peste),
    'zile_lucru_saptamana', v_zile,
    'leaduri_numitor', v_ld_numitor,
    'leaduri_in_termen', v_ld_termen,
    'leaduri_in_asteptare', v_ld_asteptare,
    'leaduri_fara_locatie', v_ld_fara_loc,
    'rata_leaduri', v_ld_rata,
    'apeluri_zile', v_tel_zile,
    'apeluri_pierdute_luna', v_tel_pierdute,
    'apeluri_returnate_luna', v_tel_returnate,
    'rata_telefon', v_tel_rata,
    'telefon_verificat', v_tel_ok,
    'include_meta', v_cu_meta,
    'meta_omise', v_omise,
    'toleranta_meta', v_toleranta,
    'coborat_meta', v_coborat,
    'surse', cardinality(v_rate)
  );
end;
$$;

-- O cheamă doar `kpi_dispecer` (security definer).
revoke execute on function public.kpi_k4_receptie(uuid[], int, int, jsonb, jsonb) from anon, authenticated, public;
grant execute on function public.kpi_k4_receptie(uuid[], int, int, jsonb, jsonb) to service_role;

create or replace function public.kpi_dispecer(
  p_cheie     text,
  p_locatii   uuid[],
  p_anul      int,
  p_luna      int,
  p_parametri jsonb,
  p_manual    jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if    p_cheie = 'incasare_la_termen'  then return kpi_k1(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'restante_recuperate' then return kpi_k2(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'rata_incasare_m1'    then return kpi_rata_incasare(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'reactivare_21z'      then return kpi_k3(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'raspuns_24h' then
    -- `rata_peste` marchează grila recepției; MOA rămâne pe logica veche.
    if p_parametri ? 'rata_peste' then
      return kpi_k4_receptie(p_locatii, p_anul, p_luna, p_parametri, p_manual);
    end if;
    return kpi_k4(p_manual, p_parametri);
  elsif p_cheie = 'conversie_lead'      then return kpi_k5(p_locatii, p_anul, p_luna, p_parametri);
  elsif p_cheie = 'diferente_casa'      then return kpi_diferente_casa(p_locatii, p_anul, p_luna);
  end if;
  raise exception 'KPI auto fără implementare: %', p_cheie using errcode = '22023';
end;
$$;

-- ── 4. Programul de lucru ca parametru al liniei K4 ───────────────────────────
update public.kpi_definitii
   set parametri_schema = parametri_schema || jsonb_build_array(jsonb_build_object(
         'cheie', 'zile_lucru_saptamana',
         'eticheta', 'Zile de lucru pe săptămână (5 = L–V, 7 = L–D)',
         'tip', 'numar', 'min', 5, 'max', 7))
 where cheie = 'raspuns_24h'
   and not exists (select 1 from jsonb_array_elements(parametri_schema) d
                    where d ->> 'cheie' = 'zile_lucru_saptamana');

update public.kpi_definitii
   set parametri_schema = parametri_schema || jsonb_build_array(
         jsonb_build_object('cheie', 'include_meta',
           'eticheta', 'Răspunde în Meta (1 = da: numără mesajele omise, 0 = nu)',
           'tip', 'numar', 'min', 0, 'max', 1),
         jsonb_build_object('cheie', 'toleranta_meta',
           'eticheta', 'Mesaje/comentarii Meta omise tolerate pe lună',
           'tip', 'numar', 'min', 0, 'max', 100, 'default', 5))
 where cheie = 'raspuns_24h'
   and not exists (select 1 from jsonb_array_elements(parametri_schema) d
                    where d ->> 'cheie' = 'include_meta');

insert into public.kpi_campuri (kpi_id, cheie, eticheta, tip, unitate, ordine)
select d.id, v.cheie, v.eticheta, v.tip, v.unitate, v.ordine
from public.kpi_definitii d
cross join (values
  ('meta_omise', 'Mesaje și comentarii Meta fără răspuns peste 24 h, de la 1 ale lunii', 'numar', null, 50),
  ('telefon_verificat', 'Am verificat apelurile pierdute notate de recepție cu istoricul telefonului', 'bifa', null, 60)
) as v(cheie, eticheta, tip, unitate, ordine)
where d.cheie = 'raspuns_24h'
on conflict (kpi_id, cheie) do nothing;

-- Meta e comună, dar răspunde doar Petruța (Alex, 29 sept. 2026).
update public.kpi_grila_linii l
   set parametri = l.parametri || jsonb_build_object(
         'include_meta', case u.email when 'pnitisor16@gmail.com' then 1 else 0 end,
         'toleranta_meta', 5)
  from public.kpi_grile g, auth.users u, public.kpi_definitii d
 where l.grila_id = g.id and u.id = g.titular_user and d.id = l.kpi_id
   and d.cheie = 'raspuns_24h' and l.parametri ? 'rata_peste'
   and u.email in ('pnitisor16@gmail.com', 'todicatheodora@gmail.com');

update public.kpi_sablon_linii l
   set parametri = l.parametri || jsonb_build_object('include_meta', 0, 'toleranta_meta', 5)
  from public.kpi_definitii d
 where d.id = l.kpi_id and d.cheie = 'raspuns_24h' and l.parametri ? 'rata_peste';

-- Petruța luni–vineri, Theo luni–duminică (Alex, 28 sept. 2026).
update public.kpi_grila_linii l
   set parametri = l.parametri || jsonb_build_object('zile_lucru_saptamana',
         case u.email when 'pnitisor16@gmail.com' then 5 else 7 end)
  from public.kpi_grile g, auth.users u, public.kpi_definitii d
 where l.grila_id = g.id and u.id = g.titular_user and d.id = l.kpi_id
   and d.cheie = 'raspuns_24h' and l.parametri ? 'rata_peste'
   and u.email in ('pnitisor16@gmail.com', 'todicatheodora@gmail.com');

-- ── 5. Fără zile lucrate / pro-rata la recepție ───────────────────────────────
update public.kpi_grile g
   set zile_min_evaluare = 0
 where exists (select 1 from public.kpi_grila_linii l join public.kpi_definitii d on d.id = l.kpi_id
                where l.grila_id = g.id and d.cheie = 'raspuns_24h' and l.parametri ? 'rata_peste');

update public.kpi_sabloane s
   set zile_min_evaluare = 0
 where exists (select 1 from public.kpi_sablon_linii l join public.kpi_definitii d on d.id = l.kpi_id
                where l.sablon_id = s.id and d.cheie = 'raspuns_24h' and l.parametri ? 'rata_peste');
