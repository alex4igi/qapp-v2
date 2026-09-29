-- K4 la recepție: datele de telefon și Meta le introduce MANAGERUL, zilnic (Alex, 29 sept. 2026):
-- „recepția nu se autoevaluează". Pe fiecare zi, locație și canal: câte interacțiuni au
-- intrat și la câte s-a răspuns în 24 h. Telefon pe toate locațiile cu recepție, Meta doar
-- unde omul răspunde în Meta (`include_meta` = 1 pe linia K4: Petruța, Ștefan).
-- Cu cifre complete, Meta și telefonul sunt procente reale — toleranța de mesaje omise
-- (`toleranta_meta`, `meta_omise`) și bifa „telefon verificat" din migrația precedentă dispar.
-- Tabelul `apeluri_pierdute_zi` (completat de recepție) e gol și se șterge.

drop table if exists public.apeluri_pierdute_zi;
drop function if exists public.trg_apeluri_pierdute_zi_atins();

-- ── 1. Interacțiunile zilei, introduse de manager ─────────────────────────────
create table public.k4_interactiuni_zi (
  locatie_id   uuid not null references public.locatii(id),
  zi           date not null,
  canal        text not null check (canal in ('telefon', 'meta')),
  intrate      int  not null check (intrate >= 0),
  cu_raspuns   int  not null check (cu_raspuns >= 0),
  completat_de uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (locatie_id, zi, canal),
  constraint k4_interactiuni_raspuns_max check (cu_raspuns <= intrate)
);

alter table public.k4_interactiuni_zi enable row level security;

revoke all on public.k4_interactiuni_zi from anon, authenticated, public;
grant select, insert, update, delete on public.k4_interactiuni_zi to authenticated;
grant all on public.k4_interactiuni_zi to service_role;

-- Doar manager+: e evaluarea recepției, recepția nu scrie și nu citește aici.
create policy k4_interactiuni_zi_manager on public.k4_interactiuni_zi
  for all to authenticated
  using ((select auth_role()) in ('owner', 'admin', 'manager'))
  with check ((select auth_role()) in ('owner', 'admin', 'manager'));

create policy deny_parinte_direct on public.k4_interactiuni_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.k4_interactiuni_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.k4_interactiuni_zi as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

create or replace function public.trg_k4_interactiuni_zi_atins() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.completat_de := coalesce(auth.uid(), new.completat_de);
  return new;
end;
$$;
revoke execute on function public.trg_k4_interactiuni_zi_atins() from anon, authenticated, public;

create trigger trg_k4_interactiuni_zi_atins before insert or update on public.k4_interactiuni_zi
  for each row execute function public.trg_k4_interactiuni_zi_atins();

-- ── 2. Unde se completează: locațiile cu grilă de recepție activă ─────────────
-- Security invoker: managerul vede grilele prin RLS-ul lor; recepția primește zero rânduri.
create or replace function public.k4_puncte_interactiuni()
returns table (locatie_id uuid, locatie_nume text, cu_meta boolean)
language sql
stable
set search_path = public
as $$
  select lo.id, lo.nume,
         bool_or(coalesce((l.parametri ->> 'include_meta')::int, 0) = 1)
  from kpi_grile g
  join kpi_grila_linii l on l.grila_id = g.id and l.activ
  join kpi_definitii d on d.id = l.kpi_id and d.cheie = 'raspuns_24h'
  join kpi_grila_locatii gl on gl.grila_id = g.id
  join locatii lo on lo.id = gl.locatie
  where g.stare = 'activa' and l.parametri ? 'rata_peste'
  group by lo.id, lo.nume
  order by lo.nume;
$$;

revoke execute on function public.k4_puncte_interactiuni() from anon, public;
grant execute on function public.k4_puncte_interactiuni() to authenticated;

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
  v_prima     date := make_date(p_anul, p_luna, 1);
  v_urm       date := (make_date(p_anul, p_luna, 1) + interval '1 month')::date;
  v_ld_numitor int; v_ld_termen int; v_ld_asteptare int; v_ld_fara_loc int;
  v_ld_rata   numeric;
  v_tel_zile  int; v_tel_in int; v_tel_ok int; v_tel_rata numeric;
  v_meta_zile int; v_meta_in int; v_meta_ok int; v_meta_rata numeric;
  v_rate      numeric[] := '{}';
  v_valoare   numeric;
  v_banda     text;
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
      and (l.created at time zone 'Europe/Bucharest')::date < v_urm
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

  select count(*) filter (where canal = 'telefon'),
         coalesce(sum(intrate) filter (where canal = 'telefon'), 0),
         coalesce(sum(cu_raspuns) filter (where canal = 'telefon'), 0),
         count(*) filter (where canal = 'meta'),
         coalesce(sum(intrate) filter (where canal = 'meta'), 0),
         coalesce(sum(cu_raspuns) filter (where canal = 'meta'), 0)
    into v_tel_zile, v_tel_in, v_tel_ok, v_meta_zile, v_meta_in, v_meta_ok
  from k4_interactiuni_zi
  where locatie_id = any(p_locatii) and zi >= v_prima and zi < v_urm;

  -- Zile completate fără nicio interacțiune intrată = n-a rămas nimeni fără răspuns.
  if v_tel_zile > 0 then
    v_tel_rata := case when v_tel_in = 0 then 100 else round(v_tel_ok::numeric / v_tel_in * 100, 1) end;
    v_rate := v_rate || v_tel_rata;
  else
    v_lipsa := v_lipsa || 'telefonul'::text;
  end if;

  if v_cu_meta then
    if v_meta_zile > 0 then
      v_meta_rata := case when v_meta_in = 0 then 100 else round(v_meta_ok::numeric / v_meta_in * 100, 1) end;
      v_rate := v_rate || v_meta_rata;
    else
      v_lipsa := v_lipsa || 'Meta'::text;
    end if;
  end if;

  if cardinality(v_rate) > 0 then
    select round(avg(x), 1) into v_valoare from unnest(v_rate) x;
    v_banda := case when v_valoare >= v_peste then 'peste'
                    when v_valoare >= v_std then 'standard'
                    else 'sub' end;
  end if;

  return jsonb_build_object(
    'kpi', 'raspuns_24h', 'mod', 'interactiuni_manager',
    'valoare', v_valoare,
    -- Managerul n-a introdus nicio zi pe un canal: K4 contează 0 și blochează închiderea.
    'banda', case when cardinality(v_lipsa) > 0 or v_banda is null then 'na' else v_banda end,
    'motiv', case when cardinality(v_lipsa) > 0 then 'necompletat'
                  when v_banda is null then 'numitor_zero' end,
    'motiv_text', case when cardinality(v_lipsa) > 0
                       then 'Managerul n-a introdus nicio zi pentru: ' || array_to_string(v_lipsa, ', ')
                            || ' (Raport KPI → Interacțiuni zilnice).'
                       when v_banda is null then 'Nicio sursă n-are date luna asta.' end,
    'banda_calculata', v_banda,
    'praguri', jsonb_build_object('standard', v_std, 'peste', v_peste),
    'zile_lucru_saptamana', v_zile,
    'leaduri_numitor', v_ld_numitor,
    'leaduri_in_termen', v_ld_termen,
    'leaduri_in_asteptare', v_ld_asteptare,
    'leaduri_fara_locatie', v_ld_fara_loc,
    'rata_leaduri', v_ld_rata,
    'telefon_zile', v_tel_zile, 'telefon_intrate', v_tel_in, 'telefon_cu_raspuns', v_tel_ok,
    'rata_telefon', v_tel_rata,
    'include_meta', v_cu_meta,
    'meta_zile', v_meta_zile, 'meta_intrate', v_meta_in, 'meta_cu_raspuns', v_meta_ok,
    'rata_meta', v_meta_rata,
    'surse', cardinality(v_rate)
  );
end;
$$;

revoke execute on function public.kpi_k4_receptie(uuid[], int, int, jsonb, jsonb) from anon, authenticated, public;
grant execute on function public.kpi_k4_receptie(uuid[], int, int, jsonb, jsonb) to service_role;

-- ── 4. Curățenie: câmpurile manuale și toleranța din varianta precedentă ──────
delete from public.kpi_campuri c
 using public.kpi_definitii d
 where d.id = c.kpi_id and d.cheie = 'raspuns_24h'
   and c.cheie in ('meta_omise', 'telefon_verificat');

update public.kpi_definitii
   set parametri_schema = (
         select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(parametri_schema) x
          where x ->> 'cheie' <> 'toleranta_meta')
 where cheie = 'raspuns_24h';

update public.kpi_definitii
   set parametri_schema = (
         select jsonb_agg(case when x ->> 'cheie' = 'include_meta'
                               then x || jsonb_build_object('eticheta',
                                    'Răspunde în Meta (1 = da: managerul introduce zilnic și Meta, 0 = nu)')
                               else x end)
           from jsonb_array_elements(parametri_schema) x)
 where cheie = 'raspuns_24h';

update public.kpi_grila_linii set parametri = parametri - 'toleranta_meta' where parametri ? 'toleranta_meta';
update public.kpi_sablon_linii set parametri = parametri - 'toleranta_meta' where parametri ? 'toleranta_meta';
