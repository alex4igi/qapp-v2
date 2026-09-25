-- 4.6 / Faza 1: funcțiile security definer ocolesc RLS-ul, deci fiecare funcție de
-- staff care atinge clienți, bani sau leaduri trebuie să-l refuze explicit pe
-- instructor (rolul `teacher` e tot `authenticated`). Marcaj: gard_teacher_20260925.
-- Toate schimbările se fac pe definiția LIVE, cu verificare că textul înlocuit
-- apare exact de câte ori ne așteptăm (altfel migrația cade).
do $$
declare
  f record;
  v_def text;
  v_nou text;
  v_n int;
begin
  -- 1) Gardul vechi din auditul 09-20 (exclude doar portalul și agenția).
  for f in
    select * from (values
      ('enqueue_confirmare_programare(uuid,uuid)', 1),
      ('notify_enrollment_move(uuid,uuid,uuid,text)', 1),
      ('notify_price_change(uuid,numeric,numeric,text,text)', 1),
      ('prune_expired_leads()', 1),
      ('get_client_restante(uuid)', 2),
      ('valideaza_bilet(text)', 1)
    ) as t(sig, n)
  loop
    v_def := pg_get_functiondef(f.sig::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, $q$('parinte', 'marketing')$q$, '')))
           / length($q$('parinte', 'marketing')$q$);
    if v_n <> f.n then
      raise exception '%: gardul apare de % ori, așteptam %', f.sig, v_n, f.n;
    end if;
    execute replace(v_def, $q$('parinte', 'marketing')$q$,
                           $q$('parinte', 'marketing', 'teacher') /* gard_teacher_20260925 */$q$);
  end loop;

  -- 2) Statisticile care excludeau doar portalul.
  foreach v_def in array array[
    pg_get_functiondef('get_crestere_neta(uuid,integer)'::regprocedure),
    pg_get_functiondef('get_statistica_prezente_achitare(date,date,uuid,uuid,uuid)'::regprocedure)
  ] loop
    if position($q$(select auth_role()) <> 'parinte'$q$ in v_def) = 0 then
      raise exception 'gardul <> parinte lipsește dintr-o statistică';
    end if;
    execute replace(v_def, $q$(select auth_role()) <> 'parinte'$q$,
      $q$(select auth_role()) not in ('parinte', 'teacher') /* gard_teacher_20260925 */$q$);
  end loop;

  -- 3) Prezența unui lead la probă: instructorul doar la grupele lui.
  v_def := pg_get_functiondef('marcheaza_prezenta_lead_curs(uuid,uuid,date,prezenta_lead)'::regprocedure);
  v_nou := replace(v_def,
    E'    raise exception ''Acces interzis.'';\n  end if;\n',
    E'    raise exception ''Acces interzis.'';\n  end if;\n'
    || E'  -- gard_teacher_20260925: doar la grupele lui\n'
    || E'  if (select auth_role()) = ''teacher'' and not teacher_can_access_curs(p_curs) then\n'
    || E'    raise exception ''Nu predai la această grupă.'' using errcode = ''42501'';\n'
    || E'  end if;\n');
  if v_nou = v_def then raise exception 'marcheaza_prezenta_lead_curs: ancora nu s-a găsit'; end if;
  execute v_nou;

  -- 4) Validarea voucherelor e a recepției (portalul are ramura lui, is_parinte()).
  v_def := pg_get_functiondef('validate_voucher_code(text,uuid,uuid,tip_plata)'::regprocedure);
  v_nou := regexp_replace(v_def, E'\nbegin\n',
    E'\nbegin\n  -- gard_teacher_20260925\n'
    || E'  if (select auth_role()) in (''marketing'', ''teacher'') then\n'
    || E'    raise exception ''Acces refuzat.'' using errcode = ''42501'';\n  end if;\n');
  if v_nou = v_def then raise exception 'validate_voucher_code: begin nu s-a găsit'; end if;
  execute v_nou;
end $$;

-- 5) Rapoartele pentru gardieni sunt doar pentru cheia de serviciu.
revoke execute on function public.anon_rpc_gap_report() from authenticated, anon, public;
revoke execute on function public.enrollments_sezon_gap_report() from authenticated, anon, public;
grant execute on function public.anon_rpc_gap_report() to service_role;
grant execute on function public.enrollments_sezon_gap_report() to service_role;
