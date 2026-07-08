-- Fix: salariul lunii se calculează DOAR pe cursurile sezonului care „deține" luna,
-- nu pe toate cursurile teacherului din toate sezoanele. Fără asta apăreau:
--   1. aceeași grupă de mai multe ori (clonă pe sezon nou — reînscrieri/clonare sezon),
--   2. grupe din sezoane vechi (2024-2025 etc.).
-- Sezonul lunii = cel care conține prima zi a lunii (make_date(anul,luna,1)). La
-- graniță (sezoanele se suprapun câteva zile, ex. 2025-2026 → 28 iun, Vara 2026 → 22 iun)
-- ziua 1 dezambiguizează curat: iunie → 2025-2026, iulie → Vara 2026. Dacă totuși
-- s-ar suprapune pe ziua 1, câștigă sezonul cel mai recent început.
-- Cursurile cu sezon NULL (legacy, fără activitate 2026) rămân excluse.

create or replace function calculeaza_salariu_teacher(
  p_teacher uuid,
  p_anul int,
  p_luna int
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data_inc date := make_date(p_anul, p_luna, 1);
  v_data_fin date := (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date;
  v_sezon uuid;
  v_model text;
  v_grupe jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_total_prezente int := 0;
  v_curs record;
  v_sedinte int;
  v_nr_cursanti int;
  v_nr_prezente int;
  v_suma_client numeric;
  v_prag_client int;
  v_suma_prezente numeric;
  v_prag_prezente int;
  v_suma numeric;
  v_nr_unitati int;
  v_prag_min int;
  v_tip text;
  v_manual boolean;
begin
  select model_salariu into v_model from teacheri where id = p_teacher;

  -- Sezonul care deține luna (prima zi a lunii cade în fereastra lui)
  select id into v_sezon
  from sezoane
  where v_data_inc between data_incepere and data_final
  order by data_incepere desc
  limit 1;

  for v_curs in
    select c.id, c.numele, c.facultativ, c.nivelul, c.zile
    from cursuri c
    where c.teacher = p_teacher
      and c.suspendat = false
      and c.sezon = v_sezon
    order by c.numele
  loop
    v_sedinte := coalesce(array_length(v_curs.zile, 1), 0);

    select count(*)::int into v_nr_prezente
    from prezente p
    join enrollments e on e.id = p.enrollment
    where e.cursul = v_curs.id
      and p.status = 'Prezent'
      and p.data between v_data_inc and v_data_fin;
    v_nr_prezente := coalesce(v_nr_prezente, 0);

    with eligibili as (
      select distinct e.client
      from enrollments e
      where e.cursul = v_curs.id
        and e.reziliat = false
        and coalesce(e.data_incepere, '1900-01-01'::date) <= v_data_fin
        and (e.data_final is null or e.data_final >= v_data_inc)
        and (
          (
            e.data_incepere is not null
            and e.data_incepere < v_data_inc
            and coalesce(e.suma, 0) > 0
            and (
              select coalesce(sum(i.suma), 0)
              from incasari i
              where i.inregistrare = e.id
                and i.data between v_data_inc and v_data_fin
            ) >= 0.9 * (
              coalesce(e.suma, 0) / greatest(1,
                (extract(year from coalesce(e.data_final, e.data_incepere))::int * 12
                   + extract(month from coalesce(e.data_final, e.data_incepere))::int)
                - (extract(year from e.data_incepere)::int * 12
                   + extract(month from e.data_incepere)::int) + 1
              )
            )
          )
          or
          (
            select count(*) from prezente p
            where p.enrollment = e.id
              and p.status = 'Prezent'
              and p.data between v_data_inc and v_data_fin
          ) > 2
        )
    )
    select count(*)::int into v_nr_cursanti from eligibili;
    v_nr_cursanti := coalesce(v_nr_cursanti, 0);

    if v_nr_cursanti = 0 then v_suma_client := 0; v_prag_client := 0;
    elsif v_nr_cursanti >= 25 then v_suma_client := 2000; v_prag_client := 25;
    elsif v_nr_cursanti >= 23 then v_suma_client := 1500; v_prag_client := 23;
    elsif v_nr_cursanti >= 20 then v_suma_client := 1280; v_prag_client := 20;
    elsif v_nr_cursanti >= 17 then v_suma_client := 1000; v_prag_client := 17;
    elsif v_nr_cursanti >= 15 then v_suma_client := 840;  v_prag_client := 15;
    elsif v_nr_cursanti >= 12 then v_suma_client := 600;  v_prag_client := 12;
    elsif v_nr_cursanti >= 10 then v_suma_client := 400;  v_prag_client := 10;
    else v_suma_client := 400; v_prag_client := 1;
    end if;
    if v_sedinte = 1 then
      v_suma_client := v_suma_client / 2;
    end if;

    if v_nr_prezente >= 275 then v_suma_prezente := 2250; v_prag_prezente := 275;
    elsif v_nr_prezente >= 250 then v_suma_prezente := 2000; v_prag_prezente := 250;
    elsif v_nr_prezente >= 200 then v_suma_prezente := 1500; v_prag_prezente := 200;
    elsif v_nr_prezente >= 160 then v_suma_prezente := 1280; v_prag_prezente := 160;
    elsif v_nr_prezente >= 140 then v_suma_prezente := 1000; v_prag_prezente := 140;
    elsif v_nr_prezente >= 120 then v_suma_prezente := 840;  v_prag_prezente := 120;
    elsif v_nr_prezente >= 100 then v_suma_prezente := 600;  v_prag_prezente := 100;
    elsif v_nr_prezente >= 80  then v_suma_prezente := 400;  v_prag_prezente := 80;
    else v_suma_prezente := 0; v_prag_prezente := 0;
    end if;

    v_manual := false;
    if v_curs.nivelul = 'Trupa' then
      v_tip := 'trupa'; v_manual := true; v_suma := 0;
      v_nr_unitati := null; v_prag_min := null;
    elsif v_model = 'per_client'
       or (v_model is null and v_curs.facultativ = false) then
      v_tip := 'recurent'; v_suma := v_suma_client;
      v_nr_unitati := v_nr_cursanti; v_prag_min := v_prag_client;
    else
      v_tip := 'facultativ'; v_suma := v_suma_prezente;
      v_nr_unitati := v_nr_prezente; v_prag_min := v_prag_prezente;
    end if;

    v_grupe := v_grupe || jsonb_build_object(
      'curs_id', v_curs.id,
      'curs_nume', v_curs.numele,
      'tip', v_tip,
      'sedinte_per_sapt', v_sedinte,
      'nr_unitati', v_nr_unitati,
      'prag_unitati_min', v_prag_min,
      'suma', v_suma,
      'manual', v_manual,
      'nr_cursanti', v_nr_cursanti,
      'nr_prezente', v_nr_prezente,
      'suma_per_client', v_suma_client,
      'prag_client_min', v_prag_client,
      'suma_per_prezente', v_suma_prezente,
      'prag_prezente_min', v_prag_prezente
    );

    v_total := v_total + coalesce(v_suma, 0);
    v_total_prezente := v_total_prezente + v_nr_prezente;
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher,
    'anul', p_anul,
    'luna', p_luna,
    'total', v_total,
    'total_prezente', v_total_prezente,
    'model_salariu', v_model,
    'sezon_id', v_sezon,
    'grupe', v_grupe
  );
end;
$$;

grant execute on function calculeaza_salariu_teacher(uuid, int, int) to authenticated;
