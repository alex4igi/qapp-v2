-- „Corectează data" pe o înrolare OPEN „Per ședință": rezervarea se mută împreună
-- cu înrolarea, pe sesiunea zilei noi (creată la nevoie), în loc să refuze cu
-- „Există o rezervare OPEN activă pe altă zi". Recepția nu avea din ce ecran să
-- remute rezervarea, deci o plată datată pe ziua încasării (Moraru, 23.09.2026)
-- rămânea blocată pe o sesiune-fantomă și omul lipsea din rosterul ședinței.
-- Încasările nu se ating — banii rămân pe data reală a plății.

create or replace function public.corecteaza_data_inrolare(p_enrollment uuid, p_data_noua date, p_motiv text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_enr          enrollments%rowtype;
  v_new_start    date;
  v_new_final    date;
  v_sezon_start  date;
  v_sezon_final  date;
  v_bad_prezente int;
  v_n_rez        int;
  v_rez_id       uuid;
  v_ses_veche    uuid;
  v_ses_noua     uuid;
  v_cap          int;
  v_ses_status   text;
  v_ocupate      int;
begin
  if auth.uid() is null
     or not (is_front_desk() or is_manager() or is_admin()) then
    raise exception 'forbidden: doar recepția+ poate corecta data înrolării';
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;
  if p_data_noua is null then
    raise exception 'Data nouă e obligatorie.';
  end if;

  select * into v_enr from enrollments where id = p_enrollment for update;
  if not found then raise exception 'Înrolarea nu există.'; end if;
  if v_enr.reziliat then
    raise exception 'Înrolarea e reziliată — data nu se mai corectează.';
  end if;

  if is_front_desk() and (
       abs(p_data_noua - current_date) > 14
    or (v_enr.data_incepere is not null and abs(current_date - v_enr.data_incepere) > 14)
  ) then
    raise exception 'Recepția poate corecta doar date aflate la cel mult 14 zile de azi — cere unui manager.';
  end if;

  if v_enr.tip_plata = 'Per luna' then
    v_new_start := date_trunc('month', p_data_noua)::date;
    v_new_final := (date_trunc('month', p_data_noua) + interval '1 month - 1 day')::date;

    if v_enr.data_incepere is not null
       and date_trunc('month', v_enr.data_incepere)::date = v_new_start then
      return jsonb_build_object('changed', false, 'reason', 'aceeași lună');
    end if;

    select count(*) into v_bad_prezente from prezente
      where enrollment = p_enrollment
        and (data < v_new_start or data > v_new_final);
    if v_bad_prezente > 0 then
      raise exception 'Înrolarea are % prezențe în afara lunii noi — corectează-le întâi.', v_bad_prezente;
    end if;

    if exists (
      select 1 from enrollments e
      where e.client = v_enr.client and e.cursul = v_enr.cursul
        and e.id <> p_enrollment and not e.reziliat
        and e.data_incepere is not null
        and date_trunc('month', e.data_incepere)::date = v_new_start
    ) then
      raise exception 'Clientul are deja o înrolare pe acest curs în luna țintă.';
    end if;
  else
    v_new_start := p_data_noua;
    v_new_final := case
      when v_enr.data_final is not null and v_enr.data_final < p_data_noua then p_data_noua
      else v_enr.data_final
    end;

    if v_enr.data_incepere = p_data_noua then
      return jsonb_build_object('changed', false, 'reason', 'aceeași dată');
    end if;

    select count(*) into v_bad_prezente from prezente
      where enrollment = p_enrollment and data <> v_new_start;
    if v_bad_prezente > 0 then
      raise exception 'Înrolarea are prezențe pe altă zi decât data nouă — corectează-le întâi.';
    end if;

    select count(*) into v_n_rez
      from open_rezervari r
      join open_sesiuni s on s.id = r.sesiune
     where r.enrollment = p_enrollment
       and r.status in ('rezervat', 'platit')
       and s.data <> v_new_start;
    if v_n_rez > 1 then
      raise exception 'Înrolarea are % rezervări OPEN active pe alte zile — cere unui manager.', v_n_rez;
    end if;
  end if;

  select s.data_incepere, s.data_final into v_sezon_start, v_sezon_final
    from cursuri c join sezoane s on s.id = c.sezon
   where c.id = v_enr.cursul;
  if v_sezon_start is not null and v_sezon_final is not null
     and (v_new_start < v_sezon_start or v_new_start > v_sezon_final) then
    raise exception 'Data nouă (%) iese din sezonul cursului (% – %).',
      v_new_start, v_sezon_start, v_sezon_final;
  end if;

  if v_enr.tip_plata <> 'Per luna' and v_n_rez = 1 then
    select r.id, r.sesiune into v_rez_id, v_ses_veche
      from open_rezervari r
      join open_sesiuni s on s.id = r.sesiune
     where r.enrollment = p_enrollment
       and r.status in ('rezervat', 'platit')
       and s.data <> v_new_start;

    if not curs_activ_in_luna(v_enr.cursul, v_new_start) then
      raise exception 'Grupa este suspendată în luna datei noi.';
    end if;

    insert into open_sesiuni (curs, data, capacitate)
    select v_enr.cursul, v_new_start, coalesce(c.capacitate_maxima, 35)
      from cursuri c where c.id = v_enr.cursul
    on conflict (curs, data) do update set instructor = open_sesiuni.instructor
    returning id into v_ses_noua;

    -- Același zăvor ca în rezerva_loc_open: serializează rezervările pe sesiune.
    select capacitate, status into v_cap, v_ses_status
      from open_sesiuni where id = v_ses_noua for update;
    if v_ses_status = 'anulata' then
      raise exception 'Ședința din % este anulată.', to_char(v_new_start, 'DD.MM.YYYY');
    end if;
    if exists (
      select 1 from open_rezervari
       where sesiune = v_ses_noua and client = v_enr.client and status <> 'anulat'
    ) then
      raise exception 'Clientul are deja o rezervare la ședința din %.', to_char(v_new_start, 'DD.MM.YYYY');
    end if;
    select count(*) into v_ocupate
      from open_rezervari where sesiune = v_ses_noua and status <> 'anulat';
    if v_ocupate >= v_cap then
      raise exception 'Ședința din % e completă (% / %).', to_char(v_new_start, 'DD.MM.YYYY'), v_ocupate, v_cap;
    end if;

    update open_rezervari set sesiune = v_ses_noua where id = v_rez_id;

    -- Sesiunea veche dispare doar dacă e o fantomă: rămasă goală și pe o zi în care
    -- cursul nu se ține. O ședință reală goală rămâne (poate avea instructor/pontaj).
    delete from open_sesiuni s
     using cursuri c
     where s.id = v_ses_veche
       and c.id = s.curs
       and not ((array['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']::zi_saptamana[])
                  [extract(dow from s.data)::int + 1] = any (coalesce(c.zile, '{}')))
       and not exists (select 1 from open_rezervari r where r.sesiune = s.id)
       and not exists (select 1 from feedback f where f.open_sesiune = s.id);
  end if;

  update enrollments
     set data_incepere = v_new_start,
         data_final    = v_new_final,
         updated       = now()
   where id = p_enrollment;

  return jsonb_build_object(
    'changed',            true,
    'old_data_incepere',  v_enr.data_incepere,
    'new_data_incepere',  v_new_start,
    'old_data_final',     v_enr.data_final,
    'new_data_final',     v_new_final,
    'rezervare_mutata',   v_rez_id is not null
  );
end;
$function$;

revoke execute on function public.corecteaza_data_inrolare(uuid, date, text) from anon, public;
grant execute on function public.corecteaza_data_inrolare(uuid, date, text) to authenticated;
