-- 4.6 / Faza 0c: coloanele sensibile vechi dispar din clienti / familii / teacheri.
-- Aplicația (4ecbb03) și funcțiile FGO citesc deja din sateliți; triggerele de
-- oglindire nu mai au ce oglindi. Fără CASCADE: dacă mai depinde ceva de o coloană,
-- migrația trebuie să cadă, nu să șteargă în tăcere un view.

-- Plasă de siguranță: nicio valoare din coloanele vechi să nu lipsească din satelit.
do $$
begin
  if exists (
    select 1 from clienti c left join clienti_facturare cf on cf.client_id = c.id
    where (c.facturare_pf_nume, c.facturare_pf_cnp, c.facturare_pf_adresa)
          is distinct from (cf.facturare_pf_nume, cf.facturare_pf_cnp, cf.facturare_pf_adresa)
      and coalesce(c.facturare_pf_nume, c.facturare_pf_cnp, c.facturare_pf_adresa) is not null
  ) then raise exception 'clienti: date PF nesincronizate cu clienti_facturare'; end if;

  if exists (
    select 1 from familii f left join familii_facturare ff on ff.familie_id = f.id
    where coalesce(f.firma_denumire, f.firma_cif, f.firma_reg_com, f.firma_adresa,
                   f.firma_banca, f.firma_iban, f.observatii) is not null
      and ff.familie_id is null
  ) then raise exception 'familii: date de firmă fără rând în familii_facturare'; end if;

  if exists (
    select 1 from teacheri t left join teacheri_detalii d on d.teacher_id = t.id
    where d.teacher_id is null
  ) then raise exception 'teacheri: instructor fără rând în teacheri_detalii'; end if;
end $$;

drop trigger trg_oglinda_clienti_facturare on public.clienti;
drop trigger trg_oglinda_familii_facturare on public.familii;
drop trigger trg_oglinda_teacheri_detalii on public.teacheri;
drop function public._oglinda_clienti_facturare();
drop function public._oglinda_familii_facturare();
drop function public._oglinda_teacheri_detalii();

alter table public.clienti
  drop column facturare_pf_nume,
  drop column facturare_pf_cnp,
  drop column facturare_pf_adresa;

alter table public.familii
  drop column firma_denumire,
  drop column firma_cif,
  drop column firma_reg_com,
  drop column firma_adresa,
  drop column firma_banca,
  drop column firma_iban,
  drop column observatii;

alter table public.teacheri
  drop column data_nasterii,
  drop column telefon,
  drop column email,
  drop column link_contract,
  drop column observatii,
  drop column marime_tricou,
  drop column model_salariu;

-- Un teacher nou trebuie să aibă mereu rândul de detalii (checklistul, salariul și
-- profilul presupun 1:1); aplicația îl scrie, iar triggerul acoperă restul drumurilor.
create function public._teacheri_detalii_la_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into teacheri_detalii (teacher_id) values (new.id) on conflict do nothing;
  return null;
end $$;
revoke execute on function public._teacheri_detalii_la_insert() from public, anon, authenticated;
create trigger trg_teacheri_detalii_la_insert after insert on public.teacheri
  for each row execute function public._teacheri_detalii_la_insert();
