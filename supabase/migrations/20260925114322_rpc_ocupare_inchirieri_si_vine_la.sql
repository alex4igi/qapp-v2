-- 4.6 / Faza 2: două citiri pe care instructorul le face azi direct din tabele și
-- pe care RLS-ul din Faza 3 i le va tăia.

-- 1) Ocuparea sălilor. Grila de închirieri și verificarea de suprapunere (care e
-- DOAR în browser — nu există constraint în DB) au nevoie de TOATE rezervările din
-- sală. Instructorul vede intervalul ocupat, dar numele, telefonul, prețul și
-- observațiile altui chiriaș nu; rezervările lui le vede întregi.
create or replace function public.get_ocupare_inchirieri(
  p_de date,
  p_pana date,
  p_locatie uuid default null,
  p_sala uuid default null
)
returns table (
  id uuid,
  sala uuid,
  data date,
  ora_start time,
  ora_final time,
  pret numeric,
  status_plata status_plata_inchiriere,
  eticheta text,
  a_mea boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rol text := (select auth_role());
  v_eu uuid := (select my_teacher_id());
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  select
    case when vede then i.id end,
    i.sala, i.data, i.ora_start, i.ora_final,
    case when vede then i.pret end,
    case when vede then i.status_plata end,
    case when vede then coalesce(
      nullif(btrim(concat_ws(' ', t.nume, t.prenume)), ''),
      nullif(btrim(concat_ws(' ', c.nume, c.prenume)), ''),
      i.guest_nume, 'guest')
    else 'Ocupat' end,
    coalesce(i.teacher = v_eu, false)
  from inchirieri i
  left join teacheri t on t.id = i.teacher
  left join clienti c on c.id = i.client
  cross join lateral (select v_rol <> 'teacher' or i.teacher = v_eu as vede) v
  where i.data between p_de and p_pana
    and (p_locatie is null or i.locatie = p_locatie)
    and (p_sala is null or i.sala = p_sala);
end;
$$;

revoke execute on function public.get_ocupare_inchirieri(date, date, uuid, uuid) from public, anon;
grant execute on function public.get_ocupare_inchirieri(date, date, uuid, uuid) to authenticated;

-- 2) „Vine și la…”: unde a fost prezent cel mai recent un cursant, în afara grupei
-- date. Instructorul întreabă doar pentru o grupă de-a lui și doar despre cursanții
-- ei; primește numele celeilalte grupe și data, nu și prezențele de acolo.
create or replace function public.get_vine_la(
  p_clienti uuid[],
  p_except_curs uuid,
  p_de_la date
)
returns table (
  client_id uuid,
  data date,
  curs_id uuid,
  curs_nume text,
  sezon_nume text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rol text := (select auth_role());
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if v_rol = 'teacher' and not teacher_can_access_curs(p_except_curs) then
    raise exception 'Nu predai la această grupă.' using errcode = '42501';
  end if;

  return query
  select distinct on (p.client)
    p.client, p.data, e.cursul, cu.numele, s.numele_sezonului
  from prezente p
  join enrollments e on e.id = p.enrollment
  join cursuri cu on cu.id = e.cursul
  left join sezoane s on s.id = cu.sezon
  where p.client = any (p_clienti)
    and p.status = 'Prezent'
    and p.data >= p_de_la
    and e.cursul <> p_except_curs
    and (
      v_rol <> 'teacher'
      or p.client in (
        select en.client from enrollments en where en.cursul = p_except_curs
        union
        select r.client from open_rezervari r
        join open_sesiuni os on os.id = r.sesiune
        where os.curs = p_except_curs and r.status <> 'anulat'
      )
    )
  order by p.client, p.data desc;
end;
$$;

revoke execute on function public.get_vine_la(uuid[], uuid, date) from public, anon;
grant execute on function public.get_vine_la(uuid[], uuid, date) to authenticated;
