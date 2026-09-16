-- Alarma „grupa s-a umplut / a trecut de capacitate".
--
-- Decizia lui Alex (16 sept. 2026): ocuparea NU se plafonează la 100% — o grupă
-- poate arăta 112%, iar la drop-in (Open Class, K-pop) e chiar normal, fiindcă
-- locurile se numără pe 30 de zile și oamenii nu vin toți odată. Dar trecerea
-- pragului trebuie să se vadă, nu să fie descoperită în raport.
--
-- Două praguri, fiecare anunțat O SINGURĂ DATĂ per grupă (cursurile sunt clonate
-- pe sezon, deci „o dată per grupă" înseamnă și „o dată pe sezon"):
--   - plină  = locuri ocupate == capacitate;
--   - peste  = locuri ocupate > capacitate.
-- Umplerea e un prag traversat, nu o stare: dacă pleacă cineva și grupa se umple
-- la loc, nu se re-anunță. O grupă care sare direct peste capacitate primește
-- doar anunțul „peste".
--
-- Locurile se citesc pe AZI (`locuri_ocupate`, ședința ține locul 30 de zile).
create or replace function notifica_grupe_peste_capacitate()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  g           record;
  v_recipient uuid;
  v_prag      text;
  v_count     int := 0;
  v_procent   int;
begin
  for g in
    with grupe as (
      select c.id, c.numele, c.capacitate_maxima as cap, coalesce(c.facultativ, false) as facultativ,
             sa.nume as sala_nume
      from cursuri c
      left join sali sa on sa.id = c.sala
      where c.sezon = (select id from sezoane where activ order by data_incepere desc nulls last limit 1)
        and not coalesce(c.one_time, false)
        and coalesce(c.capacitate_maxima, 0) > 0
        and curs_activ_in_luna(c.id, current_date)
    )
    select g.*, lo.ocupate
    from grupe g
    join locuri_ocupate(current_date, current_date, (select array_agg(id) from grupe)) lo
      on lo.curs_id = g.id
    where lo.ocupate >= g.cap
  loop
    v_prag := case when g.ocupate > g.cap then 'peste' else 'plina' end;

    -- „Peste" acoperă și „plină": după ce s-a anunțat depășirea, umplerea nu mai
    -- e o noutate.
    if exists (
      select 1 from notifications
      where kind = 'grupa_peste_capacitate'
        and payload->>'curs_id' = g.id::text
        and (payload->>'prag' = v_prag or payload->>'prag' = 'peste')
    ) then
      continue;
    end if;

    v_procent := round(100.0 * g.ocupate / g.cap);

    for v_recipient in
      select id from auth.users
      where raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
    loop
      insert into notifications (
        recipient_user_id, kind, title, body, payload, requires_action, status
      ) values (
        v_recipient,
        'grupa_peste_capacitate',
        case when v_prag = 'peste'
             then format('Grupă peste capacitate: %s (%s%%)', g.numele, v_procent)
             else format('Grupă plină: %s', g.numele) end,
        format(
          '%s · %s din %s locuri ocupate.%s',
          coalesce(g.sala_nume, 'fără sală'),
          g.ocupate,
          g.cap,
          case
            when g.facultativ
              then ' Cursul e facultativ: locurile se numără pe 30 de zile, deci oamenii nu vin toți odată.'
            when v_prag = 'peste'
              then ' Mai mulți cursanți decât locuri în sală — de văzut dacă se împarte grupa sau se mută.'
            else ' Următoarea înscriere o trece peste capacitate.'
          end
        ),
        jsonb_build_object(
          'curs_id', g.id,
          'curs_nume', g.numele,
          'prag', v_prag,
          'ocupate', g.ocupate,
          'capacitate', g.cap,
          'procent', v_procent
        ),
        false,
        'open'
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function notifica_grupe_peste_capacitate() from anon, public, authenticated;

select cron.unschedule('grupe-peste-capacitate-zilnic')
where exists (select 1 from cron.job where jobname = 'grupe-peste-capacitate-zilnic');

-- 06:30 UTC = 09:30 la Iași, înainte de primele ore.
select cron.schedule(
  'grupe-peste-capacitate-zilnic',
  '30 6 * * *',
  $$select notifica_grupe_peste_capacitate();$$
);
