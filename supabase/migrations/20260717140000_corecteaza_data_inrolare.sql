-- Corectare dată înrolare — qapp v2.
-- Context: recepția mai greșește ziua la înregistrarea unei ședințe (ex. client
-- înregistrat pe 13 când ședința era pe 17). Până acum singura „soluție" era
-- ștergere + reînrolare, care pierdea legătura cu încasarea deja făcută.
-- Acest RPC mută DOAR data înrolării; încasările nu se ating (banii rămân pe
-- data reală a plății).
--
-- Reguli:
--   - front_desk / manager / admin+owner; recepția doar în fereastra ±14 zile
--     (corectăm greșeli recente, nu rescriem istorie).
--   - `Per luna`: păstrează convenția „ziua 1 a lunii facturate" — corectarea
--     mută luna întreagă (1 → ultima zi), doar dacă toate prezențele înrolării
--     încap în luna nouă și nu există altă înrolare pe același curs în luna țintă
--     (backstop: uq_enrollment_client_curs_data).
--   - `Per sedinta` / `Per an`: mută ziua exactă; blocat dacă există prezențe pe
--     altă zi sau o rezervare OPEN activă pe o sesiune din altă zi (rezervarea
--     ține un loc pe sesiunea veche — se anulează/remută întâi din fluxul OPEN).
--   - Data nouă trebuie să rămână în sezonul cursului (cursul e legat de sezon).
--   - `sezon_id` NU se recalculează (derivă din curs, nu din dată).

create or replace function corecteaza_data_inrolare(
  p_enrollment uuid,
  p_data_noua  date,
  p_motiv      text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr          enrollments%rowtype;
  v_new_start    date;
  v_new_final    date;
  v_sezon_start  date;
  v_sezon_final  date;
  v_bad_prezente int;
begin
  if not (is_front_desk() or is_manager() or is_admin()) then
    raise exception 'forbidden: doar recepția+ poate corecta data înrolării';
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;
  if p_data_noua is null then
    raise exception 'Data nouă e obligatorie.';
  end if;

  select * into v_enr from enrollments where id = p_enrollment;
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

    if exists (
      select 1
      from open_rezervari r
      join open_sesiuni s on s.id = r.sesiune
      where r.enrollment = p_enrollment
        and r.status in ('rezervat', 'platit')
        and s.data <> v_new_start
    ) then
      raise exception 'Există o rezervare OPEN activă pe altă zi — anuleaz-o sau remut-o întâi.';
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
    'new_data_final',     v_new_final
  );
end;
$$;

revoke all on function corecteaza_data_inrolare(uuid, date, text) from public;
grant execute on function corecteaza_data_inrolare(uuid, date, text) to authenticated;
