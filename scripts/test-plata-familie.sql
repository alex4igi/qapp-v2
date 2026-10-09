-- Test izolat pentru plata pe familie (migrația 20261009150000). Rulează TOTUL într-un bloc
-- care se termină cu o excepție, deci nimic nu rămâne în baza de date. Rezultatul e în
-- mesajul excepției: „REZULTAT: {...}”. Fiecare caz trece sau scrie de ce a picat.
--
-- Rulare: copiază în SQL editor (sau execute_sql). Nu atinge date reale.
do $test$
declare
  v_uid uuid := gen_random_uuid();
  v_uid2 uuid := gen_random_uuid();
  v_sez uuid; v_loc uuid; v_curs uuid;
  v_fam uuid; v_fam2 uuid;
  v_ana uuid; v_mihai uuid; v_strain uuid;
  v_ea1 uuid; v_ea2 uuid; v_em1 uuid; v_em2 uuid; v_es uuid;
  v_dm uuid; v_ds uuid;
  v_res jsonb; v_r text := ''; v_ok int := 0; v_fail int := 0;
  v_ref text := 'ZZTEST-FAM-' || substr(md5(random()::text), 1, 8);
  v_ref2 text := 'ZZTEST-OLD-' || substr(md5(random()::text), 1, 8);
  v_amt numeric; v_cnt int; v_txt text;
begin
  -- ----- date de test -----
  insert into portal_accounts (id, email, password_hash) values (v_uid, v_ref || '@test.invalid', 'x');
  insert into portal_accounts (id, email, password_hash) values (v_uid2, v_ref || '-2@test.invalid', 'x');
  insert into sezoane (numele_sezonului, tip, stare, activ, data_incepere, data_final, scadenta_prima_rata)
    values ('ZZTEST sezon plata familie', 'principal', 'planificat', false, '2026-09-12', '2027-06-18', '2026-09-20')
    returning id into v_sez;
  select id into v_loc from locatii order by nume limit 1;
  insert into cursuri (numele, sezon, locatie, facultativ, nivelul, varsta, capacitate_maxima, zile, ora, durata_cursului, rezervari_online, pret_lunar)
    values ('ZZTEST curs plata familie', v_sez, v_loc, false, 'Incepator', 'Junior 7-10', 10, '{Luni}', '18:00', 60, false, 200)
    returning id into v_curs;
  insert into familii (nume_familie, auth_user_id) values ('ZZTEST Fam plata', v_uid) returning id into v_fam;
  insert into familii (nume_familie, auth_user_id) values ('ZZTEST Fam straina', v_uid2) returning id into v_fam2;
  insert into clienti (nume, prenume, familia) values ('ZZTEST', 'Ana', v_fam) returning id into v_ana;
  insert into clienti (nume, prenume, familia) values ('ZZTEST', 'Mihai', v_fam) returning id into v_mihai;
  insert into clienti (nume, prenume, familia) values ('ZZTEST', 'Strain', v_fam2) returning id into v_strain;
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ, reziliat)
    values (v_ana, v_curs, 'Per luna', 200, 200, '2026-09-12', '2026-09-30', true, false) returning id into v_ea1;
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ, reziliat)
    values (v_ana, v_curs, 'Per luna', 200, 200, '2026-10-01', '2026-10-31', true, false) returning id into v_ea2;
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ, reziliat)
    values (v_mihai, v_curs, 'Per luna', 300, 300, '2026-09-12', '2026-09-30', true, false) returning id into v_em1;
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ, reziliat)
    values (v_mihai, v_curs, 'Per luna', 300, 300, '2026-10-01', '2026-10-31', true, false) returning id into v_em2;
  insert into enrollments (client, cursul, tip_plata, suma_baza, suma, data_incepere, data_final, activ, reziliat)
    values (v_strain, v_curs, 'Per luna', 200, 200, '2026-09-12', '2026-09-30', true, false) returning id into v_es;
  insert into datorii (client, categorie, descriere, suma_datorata, locatie, termen)
    values (v_mihai, 'Taxa', 'ZZTEST taxa concurs', 50, v_loc, '2026-10-17') returning id into v_dm;
  insert into datorii (client, categorie, descriere, suma_datorata, locatie)
    values (v_strain, 'Taxa', 'ZZTEST taxa straina', 40, v_loc) returning id into v_ds;

  -- ----- ca părinte -----
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'parinte'))::text, true);

  -- 1. plan valid pe doi membri
  v_res := build_fifo_plan_familie(jsonb_build_array(
    jsonb_build_object('client', v_ana, 'include_inrolari', true, 'pana_la', v_ea1),
    jsonb_build_object('client', v_mihai, 'include_inrolari', true, 'pana_la', v_em2, 'datorii', jsonb_build_array(v_dm))));
  select sum(rest) into v_amt from (
    select rest from plati_inrolari where id_enrollment in (v_ea1, v_em1, v_em2)
    union all select rest from datorii_rest where id = v_dm) x;
  if (v_res->>'amount')::numeric = v_amt
     and jsonb_array_length(v_res->'plan') = 4
     and (select bool_and(x ? 'client_id') from jsonb_array_elements(v_res->'plan') x)
     and (select count(*) from jsonb_array_elements(v_res->'plan') x where (x->>'client_id')::uuid = v_ana) = 1
     and jsonb_array_length(v_res->'pe_membru') = 2 then
    v_ok := v_ok + 1; v_r := v_r || '1 ok (' || v_amt || ' lei); ';
  else v_fail := v_fail + 1; v_r := v_r || '1 FAIL ' || v_res::text || '; '; end if;

  -- 2-7. cazuri respinse
  begin perform build_fifo_plan_familie(jsonb_build_array(
      jsonb_build_object('client', v_ana, 'include_inrolari', true, 'pana_la', v_ea1),
      jsonb_build_object('client', v_ana, 'include_inrolari', true, 'pana_la', v_ea2)));
    v_fail := v_fail + 1; v_r := v_r || '2 FAIL duplicat acceptat; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '2 ok duplicat; '; end;

  begin perform build_fifo_plan_familie('[]'::jsonb);
    v_fail := v_fail + 1; v_r := v_r || '3 FAIL gol acceptat; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '3 ok gol; '; end;

  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_ana, 'include_inrolari', true)));
    v_fail := v_fail + 1; v_r := v_r || '4 FAIL pana_la null acceptat; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '4 ok pana_la null; '; end;

  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_strain, 'include_inrolari', true, 'pana_la', v_es)));
    v_fail := v_fail + 1; v_r := v_r || '5 FAIL membru strain acceptat; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '5 ok membru strain; '; end;

  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_mihai, 'include_inrolari', false, 'datorii', jsonb_build_array(v_ds))));
    v_fail := v_fail + 1; v_r := v_r || '6 FAIL datorie straina acceptata; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '6 ok datorie straina; '; end;

  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_ana, 'include_inrolari', true, 'pana_la', v_es)));
    v_fail := v_fail + 1; v_r := v_r || '6b FAIL inrolare straina acceptata; ';
  exception when others then v_ok := v_ok + 1; v_r := v_r || '6b ok inrolare straina; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'marketing'))::text, true);
  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_ana, 'include_inrolari', true, 'pana_la', v_ea1)));
    v_fail := v_fail + 1; v_r := v_r || '7 FAIL marketing acceptat; ';
  exception when insufficient_privilege then v_ok := v_ok + 1; v_r := v_r || '7 ok marketing 42501; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'parinte'))::text, true);

  -- 8. comandă pending pe planul din cazul 1 => a doua plată pe aceleași rânduri e refuzată
  insert into netopia_orders (order_ref, client_id, auth_user_id, amount, fifo_plan, status, order_type)
    values (v_ref, v_ana, v_uid, (v_res->>'amount')::numeric, v_res->'plan', 'pending', 'abonament');
  begin perform build_fifo_plan_familie(jsonb_build_array(jsonb_build_object('client', v_mihai, 'include_inrolari', true, 'pana_la', v_em1)));
    v_fail := v_fail + 1; v_r := v_r || '8 FAIL plata dubla acceptata; ';
  exception when others then
    if sqlerrm like 'Ai deja o plată în curs%' then v_ok := v_ok + 1; v_r := v_r || '8 ok plata in curs refuzata; ';
    else v_fail := v_fail + 1; v_r := v_r || '8 FAIL alt mesaj: ' || sqlerrm || '; '; end if;
  end;
  select count(*) into v_cnt from get_plati_in_curs() g where g.order_ref = v_ref and cardinality(g.randuri) = 4 and cardinality(g.membri) = 2;
  if v_cnt = 1 then v_ok := v_ok + 1; v_r := v_r || '8b ok get_plati_in_curs; ';
  else v_fail := v_fail + 1; v_r := v_r || '8b FAIL get_plati_in_curs; '; end if;

  -- 11. ecranul de după plată vede ambii membri
  v_res := portal_status_comanda(v_ref);
  if jsonb_array_length(v_res->'membri') = 2 then v_ok := v_ok + 1; v_r := v_r || '11 ok status membri; ';
  else v_fail := v_fail + 1; v_r := v_r || '11 FAIL status ' || coalesce(v_res::text, 'null') || '; '; end if;

  -- 9. confirmarea (ca server): fiecare încasare pe clientul ei
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_res := confirm_netopia_payment(v_ref, 'ZZTEST-TX-' || v_ref, (select amount from netopia_orders where order_ref = v_ref));
  select count(*) into v_cnt from incasari i
   where i.observatii like '%' || v_ref
     and ((i.inregistrare = v_ea1 and i.client = v_ana)
       or (i.inregistrare in (v_em1, v_em2) and i.client = v_mihai)
       or (i.datorie = v_dm and i.client = v_mihai));
  if (v_res->>'ok')::boolean and v_cnt = 4 then v_ok := v_ok + 1; v_r := v_r || '9 ok incasari pe membri; ';
  else v_fail := v_fail + 1; v_r := v_r || '9 FAIL ' || v_res::text || ' cnt=' || v_cnt || '; '; end if;

  -- 9b. IPN repetat = idempotent
  v_res := confirm_netopia_payment(v_ref, 'ZZTEST-TX-' || v_ref, (select amount from netopia_orders where order_ref = v_ref));
  select count(*) into v_cnt from incasari where observatii like '%' || v_ref;
  if (v_res->>'idempotent')::boolean and v_cnt = 4 then v_ok := v_ok + 1; v_r := v_r || '9b ok idempotent; ';
  else v_fail := v_fail + 1; v_r := v_r || '9b FAIL ' || v_res::text || '; '; end if;

  -- 10. comandă veche (plan fără client_id) pe Ana, luna 2
  insert into netopia_orders (order_ref, client_id, auth_user_id, amount, fifo_plan, status, order_type)
    values (v_ref2, v_ana, v_uid, 200, jsonb_build_array(jsonb_build_object('enrollment_id', v_ea2, 'pay', 200)), 'pending', 'abonament');
  v_res := confirm_netopia_payment(v_ref2, 'ZZTEST-TX-' || v_ref2, 200);
  select count(*) into v_cnt from incasari where observatii like '%' || v_ref2 and client = v_ana and inregistrare = v_ea2;
  if (v_res->>'ok')::boolean and v_cnt = 1 then v_ok := v_ok + 1; v_r := v_r || '10 ok comanda veche; ';
  else v_fail := v_fail + 1; v_r := v_r || '10 FAIL ' || v_res::text || '; '; end if;

  -- 12. membrii comenzii + liniile facturii poartă prenumele
  v_txt := netopia_order_membri(v_ref);
  v_res := get_portal_invoice_lines(v_ref);
  if v_txt like '%Ana%' and v_txt like '%Mihai%'
     and (select bool_and((x->>'denumire') like '% - Ana' or (x->>'denumire') like '% - Mihai') from jsonb_array_elements(v_res) x) then
    v_ok := v_ok + 1; v_r := v_r || '12 ok membri+factura; ';
  else v_fail := v_fail + 1; v_r := v_r || '12 FAIL ' || coalesce(v_txt, 'null') || ' ' || v_res::text || '; '; end if;
  if (select count(*) from jsonb_array_elements(get_portal_invoice_lines(v_ref2)) x where (x->>'denumire') like '% - %') = 0 then
    v_ok := v_ok + 1; v_r := v_r || '12b ok factura veche fara prenume; ';
  else v_fail := v_fail + 1; v_r := v_r || '12b FAIL factura veche; '; end if;

  -- 13. termenul datoriei one-off: taxa cu termen 17.10 nu e restantă
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'parinte'))::text, true);
  insert into datorii (client, categorie, descriere, suma_datorata, locatie, termen)
    values (v_ana, 'Taxa', 'ZZTEST taxa viitoare', 30, v_loc, current_date + 8);
  select count(*) into v_cnt from get_rezumat_plati_familie() g
   where g.client_id = v_ana and g.scadenta = current_date + 8 and not g.restant and g.suma = 30;
  if v_cnt = 1 then v_ok := v_ok + 1; v_r := v_r || '13 ok termen one-off; ';
  else v_fail := v_fail + 1; v_r := v_r || '13 FAIL termen one-off; '; end if;

  raise exception 'REZULTAT: % ok, % fail — %', v_ok, v_fail, v_r;
end
$test$;
