-- Fix: dacă o grupă recurentă are 0 cursanți numărați în luna X (nimeni n-a
-- plătit și nimeni n-a venit), nu se plătește teacher-ul pentru acea grupă în
-- acea lună. Pragul „<10 → 400 lei" se aplică doar pentru 1-9 cursanți.

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
  v_grupe jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_curs record;
  v_sedinte int;
  v_nr_unitati int;
  v_prag_min int;
  v_suma numeric;
  v_tip text;
  v_manual boolean;
begin
  for v_curs in
    select c.id, c.numele, c.facultativ, c.nivelul, c.zile
    from cursuri c
    where c.teacher = p_teacher
      and c.suspendat = false
    order by c.numele
  loop
    v_sedinte := coalesce(array_length(v_curs.zile, 1), 0);
    v_manual := false;
    v_suma := 0;
    v_nr_unitati := null;
    v_prag_min := null;

    if v_curs.nivelul = 'Trupa' then
      v_tip := 'trupa';
      v_manual := true;

    elsif v_curs.facultativ = true then
      v_tip := 'facultativ';
      select count(*)::int into v_nr_unitati
      from prezente p
      join enrollments e on e.id = p.enrollment
      where e.cursul = v_curs.id
        and p.status = 'Prezent'
        and p.data between v_data_inc and v_data_fin;

      v_nr_unitati := coalesce(v_nr_unitati, 0);

      if v_nr_unitati >= 250 then v_suma := 2000; v_prag_min := 250;
      elsif v_nr_unitati >= 160 then v_suma := 1280; v_prag_min := 160;
      elsif v_nr_unitati >= 120 then v_suma := 840;  v_prag_min := 120;
      elsif v_nr_unitati >= 100 then v_suma := 600;  v_prag_min := 100;
      elsif v_nr_unitati >= 80  then v_suma := 400;  v_prag_min := 80;
      else v_suma := 0; v_prag_min := 0;
      end if;

    else
      v_tip := 'recurent';

      with eligibili as (
        select distinct e.client
        from enrollments e
        where e.cursul = v_curs.id
          and e.activ = true
          and e.reziliat = false
          and coalesce(e.data_incepere, '1900-01-01'::date) <= v_data_fin
          and (e.data_final is null or e.data_final >= v_data_inc)
          and (
            (
              e.data_incepere is not null
              and e.data_incepere < v_data_inc
              and exists (
                select 1 from incasari i
                where i.inregistrare = e.id
                  and i.data between v_data_inc and v_data_fin
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
      select count(*)::int into v_nr_unitati from eligibili;
      v_nr_unitati := coalesce(v_nr_unitati, 0);

      -- 0 cursanți = nimic de plătit
      if v_nr_unitati = 0 then
        v_suma := 0; v_prag_min := 0;
      elsif v_nr_unitati > 25 then v_suma := 2500; v_prag_min := 26;
      elsif v_nr_unitati >= 24 then v_suma := 2000; v_prag_min := 24;
      elsif v_nr_unitati >= 21 then v_suma := 1500; v_prag_min := 21;
      elsif v_nr_unitati >= 18 then v_suma := 1280; v_prag_min := 18;
      elsif v_nr_unitati >= 16 then v_suma := 1000; v_prag_min := 16;
      elsif v_nr_unitati >= 13 then v_suma := 840;  v_prag_min := 13;
      elsif v_nr_unitati >= 10 then v_suma := 600;  v_prag_min := 10;
      else v_suma := 400; v_prag_min := 1;  -- 1-9 cursanți
      end if;

      if v_sedinte = 1 then
        v_suma := v_suma / 2;
      end if;
    end if;

    v_grupe := v_grupe || jsonb_build_object(
      'curs_id', v_curs.id,
      'curs_nume', v_curs.numele,
      'tip', v_tip,
      'sedinte_per_sapt', v_sedinte,
      'nr_unitati', v_nr_unitati,
      'prag_unitati_min', v_prag_min,
      'suma', v_suma,
      'manual', v_manual
    );

    v_total := v_total + coalesce(v_suma, 0);
  end loop;

  return jsonb_build_object(
    'teacher_id', p_teacher,
    'anul', p_anul,
    'luna', p_luna,
    'total', v_total,
    'grupe', v_grupe
  );
end;
$$;
