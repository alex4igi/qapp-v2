-- `notifica_grupe_sub_minim` primește sezonul și data „de azi" ca parametri,
-- implicit sezonul activ și current_date. Cronul o cheamă fără argumente; varianta
-- cu dată există ca regula să se poată verifica pe un sezon încheiat (la 1 ian.
-- 2026 ar fi trebuit să plece 5 alarme) fără să aștepte ianuarie 2027.

drop function if exists notifica_grupe_sub_minim();

create or replace function notifica_grupe_sub_minim(
  p_sezon uuid default null,
  p_la    date default current_date
)
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
    select * from _grupe_sub_minim(p_sezon, null, p_la)
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

revoke execute on function notifica_grupe_sub_minim(uuid, date) from anon, public, authenticated;
