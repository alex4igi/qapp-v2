-- „Salariul meu" pentru manageri și recepție (Alex, 26 sept. 2026): salariile
-- tuturor se văd de la admin în sus, iar fiecare om își vede doar salariul lui.
--
-- Omul citește doar componentele deja confirmate (tabelul nu ține altceva), deci
-- estimările live rămân ascunse, ca la instructori. Gardurile restrictive
-- deny_parinte_direct / deny_marketing_direct rămân peste politica asta.

create policy salarii_staff_self_select on public.salarii_staff_componente
  for select to authenticated
  using (user_id = (select auth.uid()));
