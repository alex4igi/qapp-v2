-- Preînscrieri Valea Lupului — comutatorul campaniei (Alex, 30.09.2026): codul e publicat,
-- dar campania pornește și se închide DOAR când decide Alex, din /preinscrieri.
-- Starea: nepornită (pornita_la nul) → activă → închisă (inchisa_la setat); se poate redeschide.
-- Site-ul o citește prin GET-ul din intake-website-lead (pagina, pop-up-ul), iar intake-ul
-- refuză o preînscriere când campania nu e activă.
--
-- Tot aici: parteneriatul e cu Școala „Profesor Mihai Dumitriu" (cursurile se țin la Școala
-- Verde), deci întrebarea din formular și coloana se referă la școala parteneră.

alter table public.preinscrieri_campanie rename column elev_scoala_verde to elev_scoala_partenera;

create table public.campanii_preinscriere (
  id          uuid primary key default gen_random_uuid(),
  -- Identic cu `preinscrieri_campanie.campanie`, cu `campanii_promovare.nume` și cu
  -- QAPP_CAMPAIGN din site (app/valea-lupului/campaign.ts).
  nume        text not null unique,
  locatie_id  uuid not null references public.locatii(id),
  pornita_la  timestamptz,
  inchisa_la  timestamptz,
  created     timestamptz not null default now(),
  updated     timestamptz not null default now()
);

create trigger trg_campanii_preinscriere_updated before update on public.campanii_preinscriere
  for each row execute function set_updated_timestamp();

insert into public.campanii_preinscriere (nume, locatie_id)
select 'Valea Lupului 2026', id from public.locatii where nume = 'Valea Lupului';

alter table public.campanii_preinscriere enable row level security;
revoke all on public.campanii_preinscriere from anon, authenticated, public;
grant select on public.campanii_preinscriere to authenticated;
grant all on public.campanii_preinscriere to service_role;

create policy campanii_preinscriere_select on public.campanii_preinscriere
  for select to authenticated using (true);
create policy deny_parinte_direct on public.campanii_preinscriere as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.campanii_preinscriere as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.campanii_preinscriere as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

-- Pornirea / închiderea: doar owner și admin, cu urmă în jurnal.
create or replace function public.seteaza_campanie_preinscriere(p_nume text, p_actiune text)
returns public.campanii_preinscriere
language plpgsql security definer set search_path = public
as $$
declare
  v_rol text := (select auth_role());
  v_c   campanii_preinscriere;
begin
  if v_rol not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  select * into v_c from campanii_preinscriere where nume = p_nume for update;
  if not found then
    raise exception 'Campania % nu există.', p_nume;
  end if;

  if p_actiune = 'porneste' then
    if v_c.pornita_la is not null and v_c.inchisa_la is null then
      raise exception 'Campania e deja pornită.';
    end if;
    update campanii_preinscriere
       set pornita_la = coalesce(pornita_la, now()), inchisa_la = null
     where id = v_c.id returning * into v_c;
  elsif p_actiune = 'inchide' then
    if v_c.pornita_la is null or v_c.inchisa_la is not null then
      raise exception 'Campania nu e pornită.';
    end if;
    update campanii_preinscriere set inchisa_la = now() where id = v_c.id returning * into v_c;
  else
    raise exception 'Acțiune necunoscută: %', p_actiune;
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, reason)
  values (auth.uid(), v_rol, 'campanie_preinscriere_' || p_actiune, 'campanie_preinscriere', v_c.id, p_nume);

  return v_c;
end;
$$;

revoke execute on function public.seteaza_campanie_preinscriere(text, text) from anon, public;
grant execute on function public.seteaza_campanie_preinscriere(text, text) to authenticated;
