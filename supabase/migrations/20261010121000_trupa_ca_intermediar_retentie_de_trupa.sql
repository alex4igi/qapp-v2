-- Trupa retrogradată (plătită ca intermediar) păstrează bonusurile de TRUPĂ, nu pe cele de intermediar
-- (Alex, 9 oct. 2026): retenția pe sumele de trupă (50 / 100), fără ocupare (20261010120000). Doar baza
-- coboară la rang × Intermediar.
--
-- Definiția vie e mai nouă decât orice fișier din repo, deci se înlocuiesc exact liniile atinse.

do $mig$
declare
  v_def text := pg_get_functiondef('public.calculeaza_salariu_teacher(uuid,integer,integer)'::regprocedure);
  v_inloc text[][];
  v_n   int;
  i     int;
begin
  v_inloc := array[
    ['      v_lei_ret := v_par -> ''retentie'' -> ''lei'' -> v_col;',
     '      -- Trupa retrogradată ia tot retenția de trupă; doar baza e de intermediar.' || chr(10)
     || '      v_lei_ret := v_par -> ''retentie'' -> ''lei''' || chr(10)
     || '                   -> case when v_c.nivelul = ''Trupa'' then ''Trupa'' else v_col end;']
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
