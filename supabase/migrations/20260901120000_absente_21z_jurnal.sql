-- Jurnalul „Absenți de 21 de zile" — fluxul zilnic de recuperare a cursanților.
--
-- De ce un jurnal și nu încă o listă calculată: KPI-ul de reactivare al postului
-- Responsabil Relații Clienți (pondere 35%) are o POARTĂ de proces — 100% din
-- cazuri contactate în ≤48h de la intrarea în stare. Poarta nu se poate verifica
-- retroactiv la sfârșit de lună: îți trebuie momentul exact al intrării și
-- momentul exact al contactului. De aceea intrările se materializează zilnic.
--
-- Relația cu `get_absente_consecutive` (20260722190000): acolo e o listă de RISC
-- recalculată live pentru instructor/analytics; aici e un REGISTRU de cazuri cu
-- ceas pornit. Împrumutăm definiția de „ședință ținută" (zi în care grupa a avut
-- cel puțin o prezență înregistrată), fiindcă e singura imună la felul în care
-- lucrează oamenii — profesorii bifează cine a venit, nu cine lipsește.
--
-- DIVERGENȚĂ DELIBERATĂ față de lista de risc: acolo „ultimul semnal" e o
-- prezență cu status <> 'Absent' (deci un 'Motivat' resetează ceasul); aici e
-- STRICT 'Prezent'. Cerința postului e „21 de zile fără nicio prezență" — un
-- copil care anunță că lipsește o lună tot trebuie contactat. Consecința de
-- comunicat titularilor: absența motivată NU oprește ceasul acestui jurnal.
--
-- Filtrul de ≥2 ședințe ținute în fereastră e obligatoriu, nu o optimizare:
-- fără el, vacanța de iarnă generează intrări în masă (măsurat la extragerea din
-- 31 aug. 2026: definiția pur calendaristică dădea 160 de „intrări" în ianuarie
-- 2026 la nivel de club, urmate de 77% „reactivare" — adică întoarcerea școlii
-- din vacanță, nu recuperare. Ar fi fost bonus plătit pentru sfârșitul vacanței).

-- ── 1. Nomenclator de motive ────────────────────────────────────────────────
-- Motivul declarat e cel mai valoros câmp din tot fluxul și n-are legătură cu
-- salariul: după un sezon ai o listă clasificată cu de ce pleacă oamenii de la
-- Quasar. Azi informația asta nu există nicăieri.

create table if not exists motive_abandon (
  id       uuid primary key default gen_random_uuid(),
  eticheta text not null unique,
  activ    boolean not null default true,
  ordine   int not null default 0,
  created  timestamptz not null default now()
);

insert into motive_abandon (eticheta, ordine) values
  ('Financiar / preț',            10),
  ('Program incompatibil',        20),
  ('Școală / teme',               30),
  ('Boală',                       40),
  ('Vacanță / plecat din oraș',   50),
  ('Distanță / transport',        60),
  ('Nu îi place grupa',           70),
  ('Nu îi place instructorul',    80),
  ('S-a mutat la alt sport',      90),
  ('Și-a pierdut interesul',     100),
  ('Necunoscut / fără răspuns',  110)
on conflict (eticheta) do nothing;

-- ── 2. Jurnalul propriu-zis ─────────────────────────────────────────────────
-- Un rând = un caz deschis pentru un (client, curs) la o dată. Contactul se
-- loghează în `client_contacte` (istoric unificat cu /datorii și /scorecard),
-- iar aici păstrăm doar FK-ul + ceea ce e specific cazului: motivul declarat și
-- pasul următor. Nu duplicăm canal/rezultat/observații.

create table if not exists absente_21z (
  id                 uuid primary key default gen_random_uuid(),
  client             uuid not null references clienti(id) on delete cascade,
  curs               uuid not null references cursuri(id) on delete cascade,
  locatie            uuid references locatii(id),
  data_intrare       date not null default current_date,
  ultima_prezenta    date,          -- null = n-a venit niciodată la grupa asta
  zile_tacere        int  not null,
  sedinte_fereastra  int  not null, -- proba că filtrul anti-vacanță a fost trecut
  -- contactare (poarta de 48h)
  contact_id         uuid references client_contacte(id) on delete set null,
  contactat_la       timestamptz,
  contactat_de       uuid references auth.users(id) on delete set null,
  motiv_declarat     uuid references motive_abandon(id) on delete restrict,
  motiv_liber        text,
  pas_urmator        text,
  -- rezultatul măsurat (completat de jobul zilnic)
  reactivat_la       date,
  reactivat          boolean,
  evaluat_la         timestamptz,   -- când s-a închis fereastra de 30 de zile
  created            timestamptz not null default now(),
  updated            timestamptz not null default now()
);

create index if not exists absente_21z_locatie_data_idx
  on absente_21z (locatie, data_intrare desc);
create index if not exists absente_21z_client_idx
  on absente_21z (client, data_intrare desc);
-- lista de lucru zilnică: cazurile necontactate, ordonate după vechime
create index if not exists absente_21z_necontactate_idx
  on absente_21z (data_intrare) where contactat_la is null;
-- cazurile cu fereastra de reactivare încă deschisă
create index if not exists absente_21z_neevaluate_idx
  on absente_21z (data_intrare) where evaluat_la is null;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Citire pentru tot staff-ul (titularul lucrează lista zilnic), scriere DOAR
-- prin RPC-uri security definer — ceasul de 48h nu are voie să fie editabil
-- direct de cine e măsurat de el.

alter table motive_abandon enable row level security;
alter table absente_21z    enable row level security;

drop policy if exists motive_abandon_select on motive_abandon;
create policy motive_abandon_select on motive_abandon
  for select to authenticated using (true);

drop policy if exists motive_abandon_write on motive_abandon;
create policy motive_abandon_write on motive_abandon
  for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists absente_21z_select on absente_21z;
create policy absente_21z_select on absente_21z
  for select to authenticated
  using (auth_role() in ('owner','admin','manager','front_desk'));

-- Garduri restrictive obligatorii pentru tabelele noi (vezi CLAUDE.md):
-- conturile de portal nu ating niciodată tabelele direct, iar agenția de ads
-- (`marketing`) nu are ce căuta în datele care produc bonusuri de salariu.
-- ATENȚIE: garduri ca ALLOWLIST, nu denylist — `auth_role()` cade pe
-- 'front_desk' pentru requesturile fără rol, deci `<> 'marketing'` ar trece.
do $$
declare t text;
begin
  foreach t in array array['motive_abandon','absente_21z'] loop
    execute format('drop policy if exists deny_parinte_direct on public.%I', t);
    execute format(
      'create policy deny_parinte_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'parinte', 'parinte');

    execute format('drop policy if exists deny_marketing_direct on public.%I', t);
    execute format(
      'create policy deny_marketing_direct on public.%I as restrictive for all to authenticated '
      || 'using (auth_role() <> %L) with check (auth_role() <> %L)', t, 'marketing', 'marketing');
  end loop;
end $$;

-- ── 4. Detecția — funcție PURĂ, parametrizată pe dată ───────────────────────
-- Primește data de referință tocmai ca să poată fi rulată pe istoric fără să
-- scrie nimic: așa se validează filtrul anti-vacanță pe ianuarie 2026 înainte
-- de a lăsa jobul să populeze jurnalul.
--
-- Întoarce cine ATINGE exact pragul de tăcere la `p_ref_date` (nu cine e peste
-- el) — jurnalul e un registru de evenimente, nu o listă de stare.

create or replace function detecteaza_absente_21z(
  p_ref_date     date default current_date,
  p_zile         int  default 21,
  p_min_sedinte  int  default 2
)
returns table (
  client            uuid,
  curs              uuid,
  locatie           uuid,
  ultima_prezenta   date,
  zile_tacere       int,
  sedinte_fereastra int
)
language sql
stable
security definer
set search_path = public
as $$
  with sezon_ref as (
    -- Sezonul care CONȚINE data de referință, nu cel activ azi: altfel funcția
    -- nu se poate rula pe istoric (testul de acceptanță e pe ianuarie 2026).
    select id from sezoane
    where data_incepere <= p_ref_date
      and (data_final is null or data_final >= p_ref_date)
    order by data_incepere desc
    limit 1
  ),
  sesiuni as (
    select e.cursul as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where c.sezon = (select id from sezon_ref)
      and coalesce(c.facultativ, false) = false
      and p.data is not null and p.data <= p_ref_date
    group by e.cursul, p.data
  ),
  inscrisi as (
    -- Populația: înrolare ne-reziliată care acoperă data de referință.
    select e.client, e.cursul as curs_id,
           coalesce(c.locatie, s.locatie) as locatie_id,
           min(e.data_incepere) as start_data
    from enrollments e
    join cursuri c on c.id = e.cursul
    left join sali s on s.id = c.sala
    where e.client is not null
      and e.reziliat = false
      and c.sezon = (select id from sezon_ref)
      and coalesce(c.facultativ, false) = false
      and e.data_incepere <= p_ref_date
      and (e.data_final is null or e.data_final >= p_ref_date)
    group by e.client, e.cursul, coalesce(c.locatie, s.locatie)
  ),
  ultima as (
    -- STRICT 'Prezent' (vezi antetul). Fără filtru pe `reziliat`: modelul are un
    -- rând de înrolare pe lună, iar lunile vechi ajung reziliate normal — o
    -- prezență rămâne o prezență indiferent ce s-a întâmplat ulterior cu rândul.
    select e.client, e.cursul as curs_id, max(p.data) as ultima_prez
    from prezente p
    join enrollments e on e.id = p.enrollment
    where p.status = 'Prezent'
      and p.data is not null and p.data <= p_ref_date
    group by e.client, e.cursul
  ),
  candidati as (
    select i.client, i.curs_id, i.locatie_id, u.ultima_prez,
           (p_ref_date - coalesce(u.ultima_prez, i.start_data))::int as zile,
           -- ședințe ținute de grupă ÎN fereastra de tăcere
           (select count(*)::int
              from sesiuni se
             where se.curs_id = i.curs_id
               and se.data > coalesce(u.ultima_prez, i.start_data - 1)
               and se.data <= p_ref_date) as sedinte
    from inscrisi i
    left join ultima u on u.client = i.client and u.curs_id = i.curs_id
  )
  select c.client, c.curs_id, c.locatie_id, c.ultima_prez, c.zile, c.sedinte
  from candidati c
  where c.zile = greatest(p_zile, 1)          -- momentul ATINGERII pragului
    and c.sedinte >= greatest(p_min_sedinte, 1);
$$;

revoke execute on function detecteaza_absente_21z(date, int, int) from anon, public;
grant execute on function detecteaza_absente_21z(date, int, int) to authenticated;

-- ── 5. Jobul zilnic ─────────────────────────────────────────────────────────
-- Două treburi: deschide cazurile noi și închide fereastra de reactivare a
-- celor vechi. Idempotent — o a doua rulare în aceeași zi nu dublează nimic.

create or replace function job_absente_21z(
  p_ref_date     date default current_date,
  p_dedup_zile   int  default 60,
  p_fereastra    int  default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noi      int := 0;
  v_evaluate int := 0;
begin
  -- Gard: cronul rulează fără `auth.uid()`; un om trebuie să fie admin.
  if auth.uid() is not null and not is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  -- 5a. Cazuri noi. Dedup PE CLIENT (nu pe client×curs): un copil înscris la
  -- două grupe n-are nevoie de două telefoane în aceeași săptămână.
  with candidati as (
    select * from detecteaza_absente_21z(p_ref_date)
  ),
  de_inserat as (
    select distinct on (c.client) c.*
    from candidati c
    where not exists (
      select 1 from absente_21z a
      where a.client = c.client
        and a.data_intrare > p_ref_date - greatest(p_dedup_zile, 1)
    )
    order by c.client, c.zile_tacere desc
  )
  insert into absente_21z
    (client, curs, locatie, data_intrare, ultima_prezenta, zile_tacere, sedinte_fereastra)
  select client, curs, locatie, p_ref_date, ultima_prezenta, zile_tacere, sedinte_fereastra
  from de_inserat;

  get diagnostics v_noi = row_count;

  -- 5b. Închiderea ferestrei de reactivare.
  --
  -- „Reactivat" = are o prezență nouă 'Prezent' în ≤30 de zile de la intrare ȘI,
  -- la data acelei prezențe, înrolarea LUNII RESPECTIVE nu are restanță
  -- EXIGIBILĂ. Exigibilă, nu neplătită: dacă revine pe 3 ale lunii iar scadența
  -- e ziua 15, abonamentul încă nu e scadent — altfel am penaliza exact
  -- revenirea rapidă, care e cea mai valoroasă. Restanța VECHE nu intră aici
  -- (se bonifică separat, prin KPI-ul de restanțe recuperate): un copil nu se
  -- blochează pentru o datorie de acum opt luni.
  with deschise as (
    select a.id, a.client, a.data_intrare
    from absente_21z a
    where a.evaluat_la is null
      and a.data_intrare <= p_ref_date - greatest(p_fereastra, 1)
  ),
  revenire as (
    select d.id, d.client,
           (select min(p.data)
              from prezente p
             where p.client = d.client
               and p.status = 'Prezent'
               and p.data >  d.data_intrare
               and p.data <= d.data_intrare + greatest(p_fereastra, 1)) as prima
    from deschise d
  ),
  verdict as (
    select r.id, r.client, r.prima,
           case when r.prima is null then false
                else not exists (
                  select 1
                  from enrollments e
                  left join lateral (
                    select coalesce(sum(i.suma), 0) as platit
                    from incasari i
                    where i.inregistrare = e.id and i.data <= r.prima
                  ) pl on true
                  where e.client = r.client
                    and e.reziliat = false
                    and e.data_incepere = date_trunc('month', r.prima)::date
                    and scadenta_rata(e.data_incepere, e.sezon_id) < r.prima
                    and coalesce(e.suma, 0) - pl.platit > 0
                )
           end as este_reactivat
    from revenire r
  )
  update absente_21z a
     set reactivat_la = v.prima,
         reactivat    = v.este_reactivat,
         evaluat_la   = now(),
         updated      = now()
    from verdict v
   where a.id = v.id;

  get diagnostics v_evaluate = row_count;

  return jsonb_build_object(
    'data', p_ref_date, 'cazuri_noi', v_noi, 'ferestre_inchise', v_evaluate
  );
end;
$$;

revoke execute on function job_absente_21z(date, int, int) from anon, public;
grant execute on function job_absente_21z(date, int, int) to authenticated;

-- 03:00 UTC, după `auto-mark-inactiv-si-exclient` (02:00): cronul acela poate
-- schimba statusuri, iar jurnalul citește starea finală a zilei.
select cron.unschedule('qapp-absente-21z-zilnic')
  where exists (select 1 from cron.job where jobname = 'qapp-absente-21z-zilnic');

select cron.schedule(
  'qapp-absente-21z-zilnic',
  '0 3 * * *',
  $$ select job_absente_21z(); $$
);

-- ── 6. RPC-uri pentru ecranul de lucru ──────────────────────────────────────

create or replace function get_absente_21z_worklist(
  p_locatii uuid[] default null,
  p_doar_necontactate boolean default false
)
returns table (
  id                uuid,
  client_id         uuid,
  client_nume       text,
  telefon           text,
  curs_nume         text,
  locatie_nume      text,
  data_intrare      date,
  ultima_prezenta   date,
  zile_tacere       int,
  ore_de_la_intrare numeric,
  contactat_la      timestamptz,
  motiv             text,
  pas_urmator       text,
  reactivat         boolean,
  reactivat_la      date
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)),
         cl.telefon, cu.numele, lo.nume,
         a.data_intrare, a.ultima_prezenta, a.zile_tacere,
         round(extract(epoch from (now() - a.created)) / 3600.0, 1),
         a.contactat_la, ma.eticheta, a.pas_urmator,
         a.reactivat, a.reactivat_la
  from absente_21z a
  join clienti cl on cl.id = a.client
  join cursuri cu on cu.id = a.curs
  left join locatii lo on lo.id = a.locatie
  left join motive_abandon ma on ma.id = a.motiv_declarat
  where (p_locatii is null or a.locatie = any(p_locatii))
    and (not p_doar_necontactate or a.contactat_la is null)
  order by a.contactat_la nulls first, a.data_intrare, cl.nume;
$$;

revoke execute on function get_absente_21z_worklist(uuid[], boolean) from anon, public;
grant execute on function get_absente_21z_worklist(uuid[], boolean) to authenticated;

-- Marchează contactul: scrie în jurnalul unificat de contacte ȘI oprește ceasul
-- de 48h. Ora se ia din server (`now()`), niciodată din client.
create or replace function marcheaza_contact_absenta(
  p_absenta_id  uuid,
  p_canal       canal_contact,
  p_rezultat    rezultat_contact,
  p_motiv_id    uuid default null,
  p_motiv_liber text default null,
  p_pas_urmator text default null,
  p_observatii  text default null
)
returns absente_21z
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     absente_21z;
  v_contact uuid;
begin
  if auth_role() not in ('owner','admin','manager','front_desk') then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select * into v_row from absente_21z where id = p_absenta_id;
  if not found then
    raise exception 'Cazul nu există' using errcode = 'P0002';
  end if;

  insert into client_contacte (client_id, user_id, canal, rezultat, scop, observatii)
  values (v_row.client, auth.uid(), p_canal, p_rezultat, 'reactivare', p_observatii)
  returning id into v_contact;

  update absente_21z
     set contact_id     = v_contact,
         -- primul contact oprește ceasul; re-contactările nu îl rescriu
         contactat_la   = coalesce(contactat_la, now()),
         contactat_de   = coalesce(contactat_de, auth.uid()),
         motiv_declarat = coalesce(p_motiv_id, motiv_declarat),
         motiv_liber    = coalesce(p_motiv_liber, motiv_liber),
         pas_urmator    = coalesce(p_pas_urmator, pas_urmator),
         updated        = now()
   where id = p_absenta_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function marcheaza_contact_absenta(uuid, canal_contact, rezultat_contact, uuid, text, text, text) from anon, public;
grant execute on function marcheaza_contact_absenta(uuid, canal_contact, rezultat_contact, uuid, text, text, text) to authenticated;
