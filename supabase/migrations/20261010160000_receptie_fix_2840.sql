-- Fixul recepției la normă întreagă e 2.840 lei net, nu 2.722 (corecție Alex, 10 oct. 2026).
-- Corecție a grilei de la 1 sept. 2026, nu o versiune nouă: nicio lună de recepție nu era confirmată.
-- Andrei Chiriac nu e atins — are fix stabilit pe om (`fix_lunar`).

do $$
begin
  if exists (select 1 from salarii_staff_componente where post = 'receptie') then
    raise exception 'Există luni de recepție confirmate — fixul nou cere o versiune nouă a grilei, nu o corecție';
  end if;
end $$;

update public.salarizare_grila
   set parametri = jsonb_set(parametri, '{fix_norma_intreaga}', '2840'),
       nota = nota || ' Fix corectat 2.722 → 2.840 (Alex, 10 oct. 2026).'
 where post = 'receptie' and valabil_de_la = '2026-09-01'
   and parametri ->> 'fix_norma_intreaga' = '2722';
