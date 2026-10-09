-- Trupa plătită ca intermediar (sub 14 cursanți sau condusă de un non-Expert) nu mai ia bonus de
-- ocupare (Alex, 9 oct. 2026). Baza și retenția rămân de intermediar; ocuparea nu se plătește la nicio
-- trupă. Efect pe sept./oct. 2026: doar `S UNIQ Crew` (Eva), −150 lei pe lună.
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
    ['      -- Ocuparea (nu la trupa cu statut: creșterea ei se măsoară în evenimente)',
     '      -- Ocuparea: la nicio trupă, nici la cea plătită ca intermediar (creșterea ei se măsoară în evenimente)'],
    ['      if v_nivel_pl is distinct from ''trupa'' then',
     '      if v_c.nivelul is distinct from ''Trupa'' then']
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
