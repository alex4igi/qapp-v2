-- Salariu teacher: (1) praguri FINALE (recurent + facultativ), (2) calc DUAL —
-- pentru FIECARE grupă calculăm AMBELE modele (per client + per prezențe) și le
-- expunem în breakdown, ca adminul să compare informativ. Suma care intră în total
-- rămâne cea a modelului activ (facultativ→prezențe, recurent→client, trupă→manual).
--
-- Praguri finale (dictate user 2026-07-08), citite ca benzi `≥ N`:
--   Per client (recurent):  ≥25→2000, ≥23→1500, ≥20→1280, ≥17→1000, ≥15→840,
--                           ≥12→600, ≥10→400, 1-9→400 (floor), 0→0. 1 ședință=½.
--   Per prezențe (facult.): ≥275→2250, ≥250→2000, ≥200→1500, ≥160→1280, ≥140→1000,
--                           ≥120→840, ≥80→400, else 0.
-- Numărarea „cursant activ" pe lună e neschimbată (plătit în lună SAU >2 prezențe);
-- refinarea „≥90% din abonament" rămâne pt un pas ulterior.

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
  v_total_prezente int := 0;
  v_curs record;
  v_sedinte int;
  v_nr_cursanti int;
  v_nr_prezente int;
  v_suma_client numeric;
  v_prag_client int;
  v_suma_prezente numeric;
  v_prag_prezente int;
  v_suma numeric;         -- suma modelului ACTIV (intră în total)
  v_nr_unitati int;       -- unitățile modelului activ (compat)
  v_prag_min int;         -- pragul modelului activ (compat)
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

    -- (a) Prezențe efective ale grupei în lună
    select count(*)::int into v_nr_prezente
    from prezente p
    join enrollments e on e.id = p.enrollment
    where e.cursul = v_curs.id
      and p.status = 'Prezent'
      and p.data between v_data_inc and v_data_fin;
    v_nr_prezente := coalesce(v_nr_prezente, 0);

    -- (b) Cursanți „activi" pe lună = client distinct cu înrolare nereziliată în
    -- fereastra lunii care a PLĂTIT pentru lună SAU a avut >2 prezențe în lună.
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
    select count(*)::int into v_nr_cursanti from eligibili;
    v_nr_cursanti := coalesce(v_nr_cursanti, 0);

    -- (c) Sumă PER CLIENT (praguri recurent finale), cu ½ la 1 ședință/săpt
    if v_nr_cursanti = 0 then v_suma_client := 0; v_prag_client := 0;
    elsif v_nr_cursanti >= 25 then v_suma_client := 2000; v_prag_client := 25;
    elsif v_nr_cursanti >= 23 then v_suma_client := 1500; v_prag_client := 23;
    elsif v_nr_cursanti >= 20 then v_suma_client := 1280; v_prag_client := 20;
    elsif v_nr_cursanti >= 17 then v_suma_client := 1000; v_prag_client := 17;
    elsif v_nr_cursanti >= 15 then v_suma_client := 840;  v_prag_client := 15;
    elsif v_nr_cursanti >= 12 then v_suma_client := 600;  v_prag_client := 12;
    elsif v_nr_cursanti >= 10 then v_suma_client := 400;  v_prag_client := 10;
    else v_suma_client := 400; v_prag_client := 1;  -- 1-9 → floor 400
    end if;
    if v_sedinte = 1 then
      v_suma_client := v_suma_client / 2;
    end if;

    -- (d) Sumă PER PREZENȚE (praguri facultativ finale)
    if v_nr_prezente >= 275 then v_suma_prezente := 2250; v_prag_prezente := 275;
    elsif v_nr_prezente >= 250 then v_suma_prezente := 2000; v_prag_prezente := 250;
    elsif v_nr_prezente >= 200 then v_suma_prezente := 1500; v_prag_prezente := 200;
    elsif v_nr_prezente >= 160 then v_suma_prezente := 1280; v_prag_prezente := 160;
    elsif v_nr_prezente >= 140 then v_suma_prezente := 1000; v_prag_prezente := 140;
    elsif v_nr_prezente >= 120 then v_suma_prezente := 840;  v_prag_prezente := 120;
    elsif v_nr_prezente >= 80  then v_suma_prezente := 400;  v_prag_prezente := 80;
    else v_suma_prezente := 0; v_prag_prezente := 0;
    end if;

    -- (e) Model ACTIV → suma care intră în total
    v_manual := false;
    if v_curs.nivelul = 'Trupa' then
      v_tip := 'trupa';
      v_manual := true;
      v_suma := 0;
      v_nr_unitati := null;
      v_prag_min := null;
    elsif v_curs.facultativ = true then
      v_tip := 'facultativ';
      v_suma := v_suma_prezente;
      v_nr_unitati := v_nr_prezente;
      v_prag_min := v_prag_prezente;
    else
      v_tip := 'recurent';
      v_suma := v_suma_client;
      v_nr_unitati := v_nr_cursanti;
      v_prag_min := v_prag_client;
    end if;

    v_grupe := v_grupe || jsonb_build_object(
      'curs_id', v_curs.id,
      'curs_nume', v_curs.numele,
      'tip', v_tip,
      'sedinte_per_sapt', v_sedinte,
      -- compat (modelul activ)
      'nr_unitati', v_nr_unitati,
      'prag_unitati_min', v_prag_min,
      'suma', v_suma,
      'manual', v_manual,
      -- dual informativ (ambele modele, pt orice grupă)
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
    'grupe', v_grupe
  );
end;
$$;

grant execute on function calculeaza_salariu_teacher(uuid, int, int) to authenticated;
