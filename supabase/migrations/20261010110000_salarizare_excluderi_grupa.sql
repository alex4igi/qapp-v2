-- Grupe scoase din salarizarea instructorului, pe luni, cu motiv (Alex, 9 oct. 2026).
--
-- Două feluri:
--   'grupa'    — grupa nu intră deloc în salariul instructorului (nici bază, nici bonusuri);
--                apare doar în `grupe_excluse`, cu motivul.
--   'retentie' — grupa se plătește, dar fără bonusul de retenție (inclusiv „prima lună = standard").
-- Bonusul de ocupare al managerului NU e atins: capacitatea lui stă în `capacitate_pool` (Alex: „doar din
-- salariul instructorului").
--
-- Definiția vie a lui calculeaza_salariu_teacher e mai nouă decât orice fișier din repo, deci se
-- înlocuiesc exact liniile atinse (ca în 20261010090000).

create table public.salarizare_excluderi (
  id          uuid primary key default gen_random_uuid(),
  curs_id     uuid not null references public.cursuri(id) on delete cascade,
  ce          text not null check (ce in ('grupa', 'retentie')),
  de_la       date not null check (de_la = date_trunc('month', de_la)::date),
  -- Ultima lună exclusă, inclusiv; null = până la capătul grupei.
  pana_la     date check (pana_la is null or (pana_la = date_trunc('month', pana_la)::date and pana_la >= de_la)),
  motiv       text not null check (length(trim(motiv)) > 0),
  adaugat_la  timestamptz not null default now(),
  adaugat_de  uuid default auth.uid()
);

create index salarizare_excluderi_curs_idx on public.salarizare_excluderi (curs_id);

-- Doar prin calculul salariului (security definer).
alter table public.salarizare_excluderi enable row level security;
revoke all on public.salarizare_excluderi from anon, authenticated, public;
grant all on public.salarizare_excluderi to service_role;

create policy deny_parinte_direct on public.salarizare_excluderi as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.salarizare_excluderi as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.salarizare_excluderi as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');


create or replace function public._salarizare_exclusa(p_curs uuid, p_ce text, p_luna date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select x.motiv
  from salarizare_excluderi x
  where x.curs_id = p_curs
    and x.ce = p_ce
    and x.de_la <= p_luna
    and (x.pana_la is null or x.pana_la >= p_luna)
  order by x.de_la desc
  limit 1
$$;

revoke execute on function public._salarizare_exclusa(uuid, text, date) from anon, authenticated, public;
grant execute on function public._salarizare_exclusa(uuid, text, date) to service_role;


do $mig$
declare
  v_def text := pg_get_functiondef('public.calculeaza_salariu_teacher(uuid,integer,integer)'::regprocedure);
  v_nl  text := chr(10);
  v_inloc text[][];
  v_n   int;
  i     int;
begin
  v_inloc := array[
    -- variabile
    ['  v_rot        numeric;',
     '  v_rot        numeric;' || v_nl
     || '  v_excluse    jsonb := ''[]''::jsonb;' || v_nl
     || '  v_motiv_ret  text;'],
    -- sezon: grupele excluse ies din listă înainte de orice numărătoare
    ['    v_ids := coalesce(v_ids, ''{}''::uuid[]);',
     '    v_ids := coalesce(v_ids, ''{}''::uuid[]);' || v_nl || v_nl
     || '    -- Grupele scoase din salarizare pe luna asta (salarizare_excluderi, cu motiv).' || v_nl
     || '    select coalesce(jsonb_agg(jsonb_build_object(''curs_id'', c.id, ''curs_nume'', c.numele, ''motiv'', m.motiv)' || v_nl
     || '                              order by c.numele), ''[]''::jsonb)' || v_nl
     || '      into v_excluse' || v_nl
     || '    from cursuri c' || v_nl
     || '    cross join lateral (select _salarizare_exclusa(c.id, ''grupa'', v_m) as motiv) m' || v_nl
     || '    where c.id = any(v_ids) and m.motiv is not null;' || v_nl
     || '    v_ids := array(select u from unnest(v_ids) u where _salarizare_exclusa(u, ''grupa'', v_m) is null);'],
    -- retenția exclusă
    ['      if v_n_prev = 0 or not curs_activ_in_luna(v_c.id, v_prev) then',
     '      v_motiv_ret := _salarizare_exclusa(v_c.id, ''retentie'', v_m);' || v_nl
     || '      if v_motiv_ret is not null then' || v_nl
     || '        v_tr_ret := ''exclus'';' || v_nl
     || '        v_pct_ret := null;' || v_nl
     || '      elsif v_n_prev = 0 or not curs_activ_in_luna(v_c.id, v_prev) then'],
    ['        when ''sub'' then 0',
     '        when ''sub'' then 0' || v_nl
     || '        when ''exclus'' then 0'],
    ['''suma'', round(coalesce(v_suma_ret, 0) * v_factor, 2));',
     '''motiv'', v_motiv_ret,' || v_nl
     || '                                       ''suma'', round(coalesce(v_suma_ret, 0) * v_factor, 2));'],
    -- vara: nici baza, nici prezențele grupelor excluse
    ['      v_mat := _grupa_matura(v_c.id, v_par);',
     '      if _salarizare_exclusa(v_c.id, ''grupa'', v_m) is not null then' || v_nl
     || '        v_excluse := v_excluse || jsonb_build_object(''curs_id'', v_c.id, ''curs_nume'', v_c.numele,' || v_nl
     || '                                                     ''motiv'', _salarizare_exclusa(v_c.id, ''grupa'', v_m));' || v_nl
     || '        continue;' || v_nl
     || '      end if;' || v_nl
     || '      v_mat := _grupa_matura(v_c.id, v_par);'],
    ['          group by c.id, c.numele) x;',
     '            and _salarizare_exclusa(c.id, ''grupa'', v_m) is null' || v_nl
     || '          group by c.id, c.numele) x;'],
    -- rezultat
    ['    ''grupe'', v_grupe,',
     '    ''grupe'', v_grupe,' || v_nl
     || '    ''grupe_excluse'', v_excluse,']
  ];

  for i in 1 .. array_length(v_inloc, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_inloc[i][1], ''))) / length(v_inloc[i][1]);
    if v_n <> 1 then
      raise exception 'calculeaza_salariu_teacher: „%” apare de % ori, nu o dată', v_inloc[i][1], v_n;
    end if;
    v_def := replace(v_def, v_inloc[i][1], v_inloc[i][2]);
  end loop;
  execute v_def;
end
$mig$;


-- Deciziile din 9 oct. 2026 (Alex), sezonul 2026-2027.
insert into public.salarizare_excluderi (curs_id, ce, de_la, pana_la, motiv)
select c.id, d.ce, d.de_la, d.pana_la, d.motiv
from (values
  ('S LMi Tiny',         'Giulia',  'retentie', date '2026-09-01', date '2026-09-01',
   'Septembrie 2026: fără retenția la standard din prima lună (Alex, 9 oct. 2026).'),
  ('N Dans Teen INC SD', 'Todica',  'retentie', date '2026-09-01', date '2026-09-01',
   'Septembrie 2026: fără retenția la standard din prima lună (Alex, 9 oct. 2026).'),
  ('S LMi Students',     'Eva',     'grupa',    date '2026-09-01', date '2026-09-01',
   'Septembrie 2026: grupa nu intră în salarizare (Alex, 9 oct. 2026).'),
  ('N MTV Commercial V', 'Caliman', 'grupa',    date '2026-09-01', null,
   'Grupa nu intră în salarizare, nici bază, nici bonusuri (Alex, 9 oct. 2026).'),
  ('S SD Teen',          'Eva',     'grupa',    date '2026-09-01', null,
   'Grupa nu intră în salarizare, nici bază, nici bonusuri (Alex, 9 oct. 2026).')
) as d(curs, teacher, ce, de_la, pana_la, motiv)
join public.cursuri c on c.numele = d.curs
join public.teacheri t on t.id = c.teacher and t.nume = d.teacher
join public.sezoane z on z.id = c.sezon and z.numele_sezonului = 'Sezon 2026-2027';

do $$
begin
  if (select count(*) from public.salarizare_excluderi) <> 5 then
    raise exception 'salarizare_excluderi: aștept 5 rânduri, am %', (select count(*) from public.salarizare_excluderi);
  end if;
end
$$;
