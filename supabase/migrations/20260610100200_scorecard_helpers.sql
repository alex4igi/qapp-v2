-- Qapp v2 — Scorecard: helperi SQL.
--   ore_lucratoare(start, end) — ore între două momente, EXCLUZÂND complet
--                                sâmbetele și duminicile (nu epoch/3600 naiv).
--   clasifica_prag(val, cheie) — 'sub' | 'standard' | 'peste' | null, citind
--                                pragul + direcția din scorecard_praguri.
--   scor_num(clasa)            — sub=0, standard=1, peste=2, null=null.

-- Ore lucrătoare: total − suprapunerea cu zilele de weekend (isodow 6=Sâmbătă, 7=Duminică).
create or replace function ore_lucratoare(p_start timestamptz, p_end timestamptz)
returns numeric
language sql
stable
as $$
  select case
    when p_end is null or p_start is null or p_end <= p_start then 0
    else greatest(0,
      extract(epoch from (p_end - p_start)) / 3600.0
      - coalesce((
          select sum(
            extract(epoch from (
              least(p_end, d + interval '1 day') - greatest(p_start, d)
            )) / 3600.0
          )
          from generate_series(
            date_trunc('day', p_start),
            date_trunc('day', p_end),
            interval '1 day'
          ) g(d)
          where extract(isodow from d) in (6, 7)
            and least(p_end, d + interval '1 day') > greatest(p_start, d)
        ), 0)
    )
  end;
$$;

-- Clasificare valoare → clasă, conform pragului și direcției configurate.
create or replace function clasifica_prag(p_val numeric, p_cheie text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_val is null then null
    else (
      select case
        when sp.directie = 'mai_mare_e_bine' then
          case when p_val >= sp.prag_peste then 'peste'
               when p_val >= sp.prag_standard then 'standard'
               else 'sub' end
        else
          case when p_val <= sp.prag_peste then 'peste'
               when p_val <= sp.prag_standard then 'standard'
               else 'sub' end
      end
      from scorecard_praguri sp
      where sp.cheie = p_cheie
    )
  end;
$$;

create or replace function scor_num(p_clasa text)
returns integer
language sql
immutable
as $$
  select case p_clasa
    when 'sub' then 0
    when 'standard' then 1
    when 'peste' then 2
    else null
  end;
$$;

grant execute on function ore_lucratoare(timestamptz, timestamptz) to authenticated;
grant execute on function clasifica_prag(numeric, text) to authenticated;
grant execute on function scor_num(text) to authenticated;
