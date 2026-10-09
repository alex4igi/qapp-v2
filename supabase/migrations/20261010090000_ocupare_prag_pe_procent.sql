-- Ocuparea instructorului: treapta se decide pe procentul exact, nu pe un prag în cursanți întregi.
--
-- Pragurile erau convertite în oameni: standard = ceil(60% × capacitate), peste = floor(80% × capacitate) + 1.
-- Cât timp fiecare cursant era un loc întreg, „≥ 9 din 10" era același lucru cu „> 80%". De la locul
-- echivalent la facultative (20260926190000) locurile au zecimale: S SD Kpop 15:30, septembrie 2026,
-- 8,50 din 10 = 85% a ieșit „standard" (8,50 < 9) în loc de „peste" (Alex, 10 oct. 2026).
-- Acum: standard = locuri >= 60% × capacitate, peste = locuri > 80% × capacitate (cum scrie grila).
-- prag_standard / prag_peste din JSON devin valorile exacte (6 și 8 la capacitate 10).
--
-- Definiția vie e mai nouă decât orice fișier din repo, deci se înlocuiesc exact liniile atinse.

do $mig$
declare
  v_def text := pg_get_functiondef('public.calculeaza_salariu_teacher(uuid,integer,integer)'::regprocedure);
  v_inloc text[][] := array[
    ['  v_pr_std     int;',
     '  v_pr_std     numeric;'],
    ['  v_pr_peste   int;',
     '  v_pr_peste   numeric;'],
    ['v_pr_std := ceil((v_par #>> ''{ocupare,prag_standard_pct}'')::numeric / 100 * v_cap)::int;',
     'v_pr_std := (v_par #>> ''{ocupare,prag_standard_pct}'')::numeric / 100 * v_cap;'],
    ['v_pr_peste := floor((v_par #>> ''{ocupare,prag_peste_pct}'')::numeric / 100 * v_cap)::int + 1;',
     'v_pr_peste := (v_par #>> ''{ocupare,prag_peste_pct}'')::numeric / 100 * v_cap;'],
    ['v_tr_mas := case when v_cursanti >= v_pr_peste then ''peste''',
     'v_tr_mas := case when v_cursanti > v_pr_peste then ''peste''']
  ];
  i int;
begin
  for i in 1 .. array_length(v_inloc, 1) loop
    if position(v_inloc[i][1] in v_def) = 0 then
      raise exception 'calculeaza_salariu_teacher: nu găsesc „%”', v_inloc[i][1];
    end if;
    v_def := replace(v_def, v_inloc[i][1], v_inloc[i][2]);
  end loop;
  execute v_def;
end
$mig$;
