-- Pragul minim de cursanți al unei grupe + semnalul „3 luni sub minim".
--
-- Regula owner-ului (14 sept. 2026): o grupă trăiește cu minim 8 cursanți
-- plătitori; în SCM Studio 2 (sala de 10 locuri) minimul e 6. Grupa care stă
-- 3 luni la rând sub minim e PROPUSĂ pentru suspendare, cu cursanții repartizați.
-- Suspendarea NU e automată — managerul decide din fișa cursului (butonul
-- existent, cu triajul cursanților). Aici e doar detecția și alarma.
--
-- Pragul e al SĂLII, ca și capacitatea (20260913100000): minimul urmează mărimea
-- camerei, nu grupa. Cursurile fără sală cad pe 8.

-- ============================================================
-- 1. Minimul pe sală
-- ============================================================
alter table sali
  add column if not exists minim_cursanti int not null default 8;

alter table sali
  drop constraint if exists sali_minim_cursanti_pozitiv;
alter table sali
  add constraint sali_minim_cursanti_pozitiv check (minim_cursanti between 1 and 30);

comment on column sali.minim_cursanti is
  'Sub atâția cursanți plătitori, 3 luni la rând, grupa e propusă pentru suspendare. Standard 8; SCM Studio 2 = 6.';

update sali set minim_cursanti = 6 where nume = 'SCM Studio 2';

-- ============================================================
-- 2. Numărătoarea canonică: cursanți plătitori în luna X
-- ============================================================
-- Definiția din docs/grila-salarizare-instructori.md §5, scrisă o singură dată:
-- suma > 0, fereastra acoperă luna, fără `data_reziliere <= ziua 1 a lunii`.
-- NU `reziliat` — bifa se pune și pe lunile încheiate normal.
--
-- Excepție de formă: din sezonul 2026-2027 înrolările „Per ședință" au
-- `data_final` NULL. Citit literal, un om care a plătit o ședință în septembrie
-- s-ar număra în fiecare lună până în iunie. Ședința aparține lunii în care a
-- fost ținută.
create or replace function cursanti_platitori_luna(p_curs uuid, p_luna date)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct e.client)::int
  from enrollments e
  where e.cursul = p_curs
    and e.client is not null
    and e.suma > 0
    and e.data_incepere < (date_trunc('month', p_luna) + interval '1 month')::date
    and coalesce(
          e.data_final,
          case when e.tip_plata = 'Per sedinta' then e.data_incepere end,
          'infinity'::date
        ) >= date_trunc('month', p_luna)::date
    and (e.data_reziliere is null or e.data_reziliere > date_trunc('month', p_luna)::date);
$$;

revoke execute on function cursanti_platitori_luna(uuid, date) from anon, public;
grant execute on function cursanti_platitori_luna(uuid, date) to authenticated;

-- ============================================================
-- 3. Evaluarea: câte luni la rând e grupa sub minim
-- ============================================================
-- Luna de lansare = cea mai târzie dintre începutul sezonului și crearea cursului
-- (verificat pe 2025-2026: `created` coincide cu prima lună cu plătitori la
-- grupele deschise în timpul sezonului). Luna lansării e de rodaj și nu se
-- testează; se testează doar lunile ÎNCHEIATE de după ea. Pentru sezonul care
-- începe în septembrie ⇒ oct, nov, dec ⇒ primul semnal posibil la 1 ianuarie,
-- exact „primul test ian. 2027" din grilă.
--
-- O lună în care grupa a fost suspendată rupe șirul: acolo nu există „sub minim".
--
-- Open class (stil 'Open') și cursurile one-time nu au locuri permanente, deci
-- n-au prag de existență.
--
-- `p_la` există doar ca să se poată verifica regula pe un sezon trecut; UI-ul și
-- cronul folosesc azi.
create or replace function _grupe_sub_minim(
  p_sezon uuid default null,
  p_curs  uuid default null,
  p_la    date default current_date
)
returns table (
  curs_id               uuid,
  curs_nume             text,
  sala_nume             text,
  teacher_nume          text,
  minim                 int,
  luna_lansare          date,
  luni                  jsonb,
  luni_sub_consecutive  int,
  cursanti_luna_curenta int,
  stare                 text,
  sezon_in_curs         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with sezon_tinta as (
    select coalesce(
      p_sezon,
      (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
    ) as id
  ),
  c as (
    select
      c.id,
      c.numele,
      sa.nume as sala_nume,
      nullif(btrim(concat_ws(' ', t.nume, t.prenume)), '') as teacher_nume,
      coalesce(sa.minim_cursanti, 8) as minim,
      greatest(
        date_trunc('month', s.data_incepere),
        date_trunc('month', c.created)
      )::date as lansare,
      date_trunc('month', s.data_final)::date as ultima_luna_sezon,
      (p_la between s.data_incepere and s.data_final) as in_curs,
      exists (
        select 1 from cursuri_suspendari cs
        where cs.curs = c.id and cs.pana_luna is null
      ) as are_suspendare
    from cursuri c
    join sezoane s on s.id = c.sezon
    left join sali sa on sa.id = c.sala
    left join teacheri t on t.id = c.teacher
    where (
            (p_curs is not null and c.id = p_curs)
            or (p_curs is null and c.sezon = (select id from sezon_tinta))
          )
      and coalesce(c.stil, '') <> 'Open'
      and not coalesce(c.one_time, false)
      and s.data_incepere is not null
      and s.data_final is not null
  ),
  m as (
    select
      c.id,
      gs::date as luna,
      curs_activ_in_luna(c.id, gs::date) as activ
    from c
    cross join lateral generate_series(
      (c.lansare + interval '1 month')::date,
      least(
        c.ultima_luna_sezon,
        (date_trunc('month', p_la) - interval '1 month')::date
      ),
      interval '1 month'
    ) gs
  ),
  mn as (
    select
      m.id,
      m.luna,
      m.activ,
      case when m.activ then cursanti_platitori_luna(m.id, m.luna) end as n
    from m
  ),
  mf as (
    select mn.*, (mn.activ and mn.n < c.minim) as sub
    from mn
    join c on c.id = mn.id
  ),
  agg as (
    select
      mf.id,
      jsonb_agg(
        jsonb_build_object(
          'luna', to_char(mf.luna, 'YYYY-MM'),
          'cursanti', mf.n,
          'activ', mf.activ,
          'sub', mf.sub
        )
        order by mf.luna
      ) as luni,
      count(*) filter (
        where mf.luna > coalesce(
          (select max(x.luna) from mf x where x.id = mf.id and not x.sub),
          '-infinity'::date
        )
      )::int as streak
    from mf
    group by mf.id
  )
  select
    c.id,
    c.numele,
    c.sala_nume,
    c.teacher_nume,
    c.minim,
    c.lansare,
    coalesce(agg.luni, '[]'::jsonb),
    coalesce(agg.streak, 0),
    case when c.in_curs
         then cursanti_platitori_luna(c.id, date_trunc('month', p_la)::date)
    end,
    case
      when c.are_suspendare then 'suspendat'
      when agg.id is null then 'in_rodaj'
      when agg.streak >= 3 then 'de_suspendat'
      when agg.streak >= 1 then 'in_observatie'
      else 'ok'
    end,
    c.in_curs
  from c
  left join agg on agg.id = c.id
  order by c.numele;
$$;

comment on function _grupe_sub_minim(uuid, uuid, date) is
  'Intern (fără gard de rol) — îl cheamă cronul. UI-ul trece prin get_grupe_sub_minim.';

revoke execute on function _grupe_sub_minim(uuid, uuid, date) from anon, public, authenticated;

create or replace function get_grupe_sub_minim(
  p_sezon uuid default null,
  p_curs  uuid default null
)
returns table (
  curs_id               uuid,
  curs_nume             text,
  sala_nume             text,
  teacher_nume          text,
  minim                 int,
  luna_lansare          date,
  luni                  jsonb,
  luni_sub_consecutive  int,
  cursanti_luna_curenta int,
  stare                 text,
  sezon_in_curs         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Aceiași oameni care pot suspenda; decizia e a lor.
  if (select auth_role()) not in ('owner', 'admin', 'manager') then
    raise exception 'Doar managerii văd grupele sub minim.' using errcode = '42501';
  end if;
  return query select * from _grupe_sub_minim(p_sezon, p_curs, current_date);
end;
$$;

revoke execute on function get_grupe_sub_minim(uuid, uuid) from anon, public;
grant execute on function get_grupe_sub_minim(uuid, uuid) to authenticated;

-- ============================================================
-- 4. Alarma lunară către manageri
-- ============================================================
-- Pe 1 ale lunii, după ce luna trecută s-a închis. O notificare per grupă per
-- lună evaluată: dacă managerul a decis să țină grupa și ea rămâne sub minim și
-- luna următoare, întrebarea se pune din nou — e o decizie pe lună, nu una pe viață.
-- Doar în timpul sezonului: după ultima lună n-ai ce suspenda.
create or replace function notifica_grupe_sub_minim()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  g            record;
  v_recipient  uuid;
  v_count      int := 0;
  v_ultima     text;
  v_serie      text;
  v_luni_ro    text[] := array['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
begin
  for g in
    select * from _grupe_sub_minim(null, null, current_date)
    where stare = 'de_suspendat' and sezon_in_curs
  loop
    v_ultima := g.luni -> (jsonb_array_length(g.luni) - 1) ->> 'luna';

    if exists (
      select 1 from notifications
      where kind = 'grupa_sub_minim'
        and payload->>'curs_id' = g.curs_id::text
        and payload->>'ultima_luna' = v_ultima
    ) then
      continue;
    end if;

    select string_agg(
             v_luni_ro[extract(month from (x->>'luna' || '-01')::date)::int]
               || ' ' || (x->>'cursanti'),
             ' · ' order by x->>'luna'
           )
      into v_serie
      from (
        select x
        from jsonb_array_elements(g.luni) x
        order by x->>'luna' desc
        limit g.luni_sub_consecutive
      ) ultimele;

    for v_recipient in
      select id from auth.users
      where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
    loop
      insert into notifications (
        recipient_user_id, kind, title, body, payload, requires_action, status
      ) values (
        v_recipient,
        'grupa_sub_minim',
        format('Grupă sub minim de %s luni: %s', g.luni_sub_consecutive, g.curs_nume),
        format(
          '%s · minim %s cursanți · %s. Propusă pentru suspendare, cu cursanții repartizați — decizia e a ta, din fișa cursului.',
          coalesce(g.sala_nume, 'fără sală'),
          g.minim,
          v_serie
        ),
        jsonb_build_object(
          'curs_id', g.curs_id,
          'curs_nume', g.curs_nume,
          'minim', g.minim,
          'luni_sub', g.luni_sub_consecutive,
          'ultima_luna', v_ultima
        ),
        true,
        'open'
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function notifica_grupe_sub_minim() from anon, public, authenticated;

select cron.unschedule('grupe-sub-minim-lunar')
where exists (select 1 from cron.job where jobname = 'grupe-sub-minim-lunar');

-- 06:00 UTC = 08:00–09:00 la Iași.
select cron.schedule(
  'grupe-sub-minim-lunar',
  '0 6 1 * *',
  $$select notifica_grupe_sub_minim();$$
);
