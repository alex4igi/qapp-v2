-- Detaliul cursanților numărați la salariu, pe grupele recurente (Alex, 7 oct. 2026): câți au venit pe
-- abonament integral și câți cu pro-rata, cu suma și prezențele lor din lună. Grila îi numără pe toți
-- la fel (un loc), dar un client de 270 lei nu e unul de 39 — adminul (și Roxana, la plată) trebuie
-- să vadă diferența. Doar informativ: nu schimbă salariul.
--
-- Doar pentru admini: conține nume și sume ale clienților, deci nu intră în calculul pe care îl vede
-- instructorul (`calculeaza_salariu_teacher` / snapshot-ul din `salarii_teacher`).
--
-- Pro-rata = suma de bază a lunii (suma_baza, înainte de reduceri) sub prețul lunar plin al grupei —
-- cel mai mic dintre `pret_lunar` și `pret_lunar_promo` (reînscrierea). Reducerile de familie, voucherul
-- sau creditul nu fac din client unul pro-rata. În septembrie pro-rata nu se vede din dată (toți încep
-- la startul sezonului), doar din sumă. Abonamentul „Per an" e integral.
-- Mulțimea de cursanți e aceeași ca la salariu: `_inrolari_platite_randuri`.

create or replace function public.detaliu_cursanti_salariu(p_cursuri uuid[], p_anul int, p_luna int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_de   date := make_date(p_anul, p_luna, 1);
  v_pana date := (make_date(p_anul, p_luna, 1) + interval '1 month - 1 day')::date;
  v_out  jsonb;
begin
  if not is_admin() then
    raise exception 'Doar adminii văd sumele plătite de cursanți.' using errcode = '42501';
  end if;

  with c as (
    select id, least(pret_lunar, coalesce(pret_lunar_promo, pret_lunar)) as pret_plin
    from cursuri
    where id = any(p_cursuri) and not coalesce(facultativ, false)
  ),
  r as (
    select distinct x.client, x.curs_id as cursul, x.tip, x.data_incepere
    from _inrolari_platite_randuri(v_de, v_pana, (select array_agg(id) from c), false) x
  ),
  om as (
    select e.cursul, e.client,
           bool_or(e.tip_plata = 'Per an') as anual,
           sum(e.suma) as suma,
           sum(coalesce(e.suma_baza, e.suma)) as suma_baza
    from enrollments e
    join r on r.client = e.client and r.cursul = e.cursul
          and r.data_incepere = e.data_incepere and r.tip = e.tip_plata::text
    where e.suma > 0
    group by e.cursul, e.client
  ),
  prez as (
    select en.cursul, p.client, count(*) as n
    from prezente p
    join enrollments en on en.id = p.enrollment
    where en.cursul in (select id from c)
      and p.status = 'Prezent'
      and p.data::date between v_de and v_pana
    group by en.cursul, p.client
  ),
  cls as (
    select om.cursul, om.client, om.suma, om.suma_baza, om.anual, c.pret_plin,
           coalesce(prez.n, 0) as prezente,
           (om.anual or om.suma_baza >= c.pret_plin) as integral,
           btrim(concat_ws(' ', cl.prenume, cl.nume)) as nume
    from om
    join c on c.id = om.cursul
    left join prez on prez.cursul = om.cursul and prez.client = om.client
    left join clienti cl on cl.id = om.client
  )
  select coalesce(jsonb_object_agg(t.cursul, t.x), '{}'::jsonb) into v_out
  from (
    select cursul, jsonb_build_object(
      'pret_lunar', max(pret_plin),
      'integral', count(*) filter (where integral),
      'prorata', count(*) filter (where not integral),
      'suma_integral', coalesce(sum(suma) filter (where integral), 0),
      'suma_prorata', coalesce(sum(suma) filter (where not integral), 0),
      'prezente_prorata', coalesce(sum(prezente) filter (where not integral), 0),
      'lista_prorata', coalesce(jsonb_agg(jsonb_build_object(
          'client_id', client, 'nume', nume, 'suma', suma, 'prezente', prezente)
        order by suma, nume) filter (where not integral), '[]'::jsonb)
    ) as x
    from cls
    group by cursul
  ) t;

  return v_out;
end;
$$;

revoke execute on function public.detaliu_cursanti_salariu(uuid[], int, int) from anon, public;
grant execute on function public.detaliu_cursanti_salariu(uuid[], int, int) to authenticated;
