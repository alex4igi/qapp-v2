-- S-S2 SD Teen (Adrian): fără bonusul de retenție în septembrie 2026 (Alex, 9 oct. 2026).

insert into public.salarizare_excluderi (curs_id, ce, de_la, pana_la, motiv)
select c.id, 'retentie', date '2026-09-01', date '2026-09-01',
       'Septembrie 2026: fără retenția la standard din prima lună (Alex, 9 oct. 2026).'
from public.cursuri c
join public.teacheri t on t.id = c.teacher and t.nume = 'Adrian'
join public.sezoane z on z.id = c.sezon and z.numele_sezonului = 'Sezon 2026-2027'
where c.numele = 'S-S2 SD Teen';

do $$
begin
  if (select count(*) from public.salarizare_excluderi x join public.cursuri c on c.id = x.curs_id
      where c.numele = 'S-S2 SD Teen') <> 1 then
    raise exception 'S-S2 SD Teen: aștept exact o excludere';
  end if;
end
$$;
