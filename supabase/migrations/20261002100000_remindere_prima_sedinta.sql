-- Remindere înainte de prima ședință (decizie Alex, 02.10.2026):
--   * reînscrișii primesc UN SMS cu 7 zile înainte de startul sezonului;
--   * toți ceilalți (inclusiv cei înscriși de vară pentru septembrie) primesc un SMS
--     cu o zi înainte de prima ședință, DOAR dacă prima ședință e la mai mult de
--     7 zile de la înscriere — sub 7 zile ajunge confirmarea de a doua zi.
-- Confirmarea înrolării (cron-afternoon, a doua zi) rămâne neschimbată.
--
-- Trimiterea o face cron-morning (10:00). Aici stau: calculul primei ședințe, lista
-- de trimis pentru o zi dată (rulabilă și pe date trecute, ca dry-run) și urma
-- trimiterilor — o pereche (client, grupă) primește cel mult un reminder, de oricare
-- fel. Așa reînscrisul care a primit mesajul de start nu mai primește și pe cel de
-- o zi înainte, iar cel care adaugă o grupă nouă în noiembrie intră în ciclul normal.

create table if not exists remindere_prima_sedinta (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clienti(id) on delete cascade,
  curs_id       uuid not null references cursuri(id) on delete cascade,
  tip           text not null check (tip in ('start_sezon', 'prima_sedinta')),
  data_sedinta  date not null,
  status        text not null check (status in ('trimis', 'esuat', 'fara_telefon', 'fara_adresa')),
  error         text,
  creat         timestamptz not null default now(),
  unique (client_id, curs_id)
);

alter table remindere_prima_sedinta enable row level security;
revoke all on table remindere_prima_sedinta from anon, authenticated, public;
grant all on table remindere_prima_sedinta to service_role;

create policy deny_parinte_direct on remindere_prima_sedinta as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on remindere_prima_sedinta as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on remindere_prima_sedinta as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

-- Prima zi de curs >= p_de_la: ziua e în `cursuri.zile`, nu cade în vacanța
-- sezonului, grupa nu e suspendată în luna aceea și nu trece de finalul sezonului.
create or replace function prima_sedinta_curs(p_curs uuid, p_de_la date)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select d::date
  from cursuri c
  join sezoane s on s.id = c.sezon
  cross join generate_series(p_de_la, p_de_la + 180, interval '1 day') d
  where c.id = p_curs
    and d::date <= s.data_final
    and (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'])
          [extract(dow from d)::int + 1] = any(c.zile::text[])
    and not exists (
      select 1 from vacante v
      where v.sezon_id = c.sezon and d::date between v.data_incepere and v.data_final
    )
    and curs_activ_in_luna(c.id, d::date)
  order by d
  limit 1;
$$;

revoke execute on function prima_sedinta_curs(uuid, date) from anon, public;
grant execute on function prima_sedinta_curs(uuid, date) to authenticated;

-- Ce trebuie trimis în ziua p_azi. Doar grupe/trupe recurente (nu facultative, nu
-- one-time, nu „Per ședință") — același perimetru ca la confirmarea înrolării.
--
-- „Reînscris" = aceeași definiție ca raportul /start-sezon (pool_revenit): are un
-- abonament plătit, nereziliat, din ALT sezon, început în ultimele 5 luni dinaintea
-- startului. Fereastra de start e [start − 7, start − 1]: cine se reînscrie în
-- ultima săptămână primește mesajul a doua zi dimineață, nu rămâne fără nimic.
create or replace function remindere_prima_sedinta_de_trimis(p_azi date)
returns table (
  tip           text,
  client_id     uuid,
  curs_id       uuid,
  data_sedinta  date,
  ora           text,
  prenume       text,
  telefon       text,
  curs_nume     text,
  locatie_nume  text
)
language sql
stable
security definer
set search_path = public
as $$
  with perechi as (
    select e.client, e.cursul, c.sezon,
           min(e.data_incepere) as prima_luna,
           min((e.created at time zone 'Europe/Bucharest')::date) as creat_zi
    from enrollments e
    join cursuri c on c.id = e.cursul
    join sezoane s on s.id = c.sezon
    where e.data_reziliere is null
      and e.tip_plata in ('Per luna', 'Per an')
      and not c.facultativ
      and not coalesce(c.one_time, false)
      and s.data_final >= p_azi
    group by e.client, e.cursul, c.sezon
  ),
  cu_data as (
    select p.*, s.data_incepere as start_sezon,
           prima_sedinta_curs(p.cursul, greatest(p.prima_luna, s.data_incepere, p.creat_zi)) as prima
    from perechi p
    join sezoane s on s.id = p.sezon
    -- Fereastra de start SAU prima ședință mâine; restul nu merită calculat.
    where p_azi between s.data_incepere - 7 and s.data_incepere - 1
       or greatest(p.prima_luna, s.data_incepere, p.creat_zi) between p_azi - 60 and p_azi + 1
  ),
  clasificat as (
    select d.*,
           exists (
             select 1 from enrollments e2
             where e2.client = d.client
               and e2.sezon_id is distinct from d.sezon
               and e2.suma > 0
               and e2.data_reziliere is null
               and e2.data_incepere >= (date_trunc('month', d.start_sezon) - interval '5 months')::date
               and e2.data_incepere < d.start_sezon
           ) as reinscris
    from cu_data d
    where d.prima is not null
  ),
  de_trimis as (
    select 'start_sezon'::text as tip, k.*
    from clasificat k
    where k.reinscris
      and p_azi between k.start_sezon - 7 and k.start_sezon - 1
    union all
    select 'prima_sedinta'::text, k.*
    from clasificat k
    where k.prima = p_azi + 1
      and k.prima - k.creat_zi > 7
      and not exists (
        select 1 from prezente pr
        join enrollments ep on ep.id = pr.enrollment
        where pr.client = k.client and ep.cursul = k.cursul
      )
  )
  select t.tip, t.client, t.cursul, t.prima,
         coalesce(c.ore_pe_zi ->> (array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'])
                                    [extract(dow from t.prima)::int + 1], c.ora),
         cl.prenume::text, cl.telefon::text, c.numele::text, l.nume::text
  from de_trimis t
  join cursuri c on c.id = t.cursul
  join clienti cl on cl.id = t.client
  left join locatii l on l.id = c.locatie
  -- Locul trebuie să fie încă al lui în ziua ședinței (rezilierea taie rândurile).
  where exists (
      select 1 from enrollments e3
      where e3.client = t.client and e3.cursul = t.cursul
        and e3.data_reziliere is null
        and e3.data_incepere <= t.prima
        and coalesce(e3.data_final, t.prima) >= t.prima
    )
    and not exists (
      select 1 from remindere_prima_sedinta r
      where r.client_id = t.client and r.curs_id = t.cursul and r.status <> 'esuat'
    );
$$;

revoke execute on function remindere_prima_sedinta_de_trimis(date) from anon, authenticated, public;
grant execute on function remindere_prima_sedinta_de_trimis(date) to service_role;
