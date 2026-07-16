-- „Deja client" doar pentru clienți REALI: baza clienti conține ~1.4k fantome de
-- import v1 (EXclient fără nicio înrolare și nicio plată). Un lead care s-a
-- potrivit doar cu o astfel de fantomă nu e cu adevărat un client existent →
-- îl readucem în fluxul normal (deja_client=false, id_client=null, setate tot de
-- backfill-ul acestei feature, deci reversibile fără pierdere de date).
update leads l
set deja_client = false, id_client = null
where l.deja_client = true
  and l.id_client is not null
  and not exists (select 1 from enrollments e where e.client = l.id_client)
  and not exists (select 1 from incasari i where i.client = l.id_client);
