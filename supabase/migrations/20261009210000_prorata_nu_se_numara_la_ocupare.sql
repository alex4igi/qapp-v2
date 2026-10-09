-- Prorata nu se numără la ocupare (Alex, 9 oct. 2026): „nu pot da bonusul pentru ocupare pentru un
-- client care nu a achitat înrolarea completă" — adică cei intrați mai târziu, pe prorata.
--
-- Regula:
--   • Rata de prorata (a intrat după începutul lunii și plătește doar ședințele prinse) NU se numără
--     în numărătoarea LUNARĂ: bonusul pe ocupare al managerului, ocuparea instructorului, pragul
--     minim de 8 (și maturitatea pentru vară). Se numără din prima lună întreagă.
--   • Contează motivul, nu cine a calculat: prorata calculată de aplicație și cea făcută de mână de
--     manager („recalculare 2 sed", „4*45 septembrie") sunt același lucru.
--   • Prorata înseamnă că omul RĂMÂNE client: dacă luna următoare nu mai are rată (a plecat), luna de
--     prorata se numără. Ajustările de mână la reziliere se numără.
--   • Reducerile, voucherele, promo de reînscriere, reducerea de frați NU fac din rată una de prorata.
--   • Cine a intrat târziu dar a plătit luna întreagă (plafonul la rata lunii) se numără.
--   • Ocupările pe ZI (Overview, agenda, liste, rosterul) rămân neatinse: copiii vin efectiv la ședințe.
--     Retenția instructorului rămâne pe oameni, neatinsă.
--
-- Prorata nu se poate deduce sigur din date (în 12–21 sept. a fost făcută de mână, cu data de start
-- rescrisă la 12; reducerile comerciale arată la fel ca suma), deci stă ca semn pe rând:
-- `enrollments.prorata`. Îl pune aplicația la înrolare și managerul din „Ajustează preț"
-- (`seteaza_prorata_inrolare`, cu urmă în audit_log). Din browser coloana nu se poate schimba direct.

-- ── Semnul ────────────────────────────────────────────────────────────────────
alter table public.enrollments
  add column if not exists prorata boolean not null default false;

comment on column public.enrollments.prorata is
  'Rata primei luni e prorata (a intrat după începutul lunii). Nu se numără la ocuparea lunară dacă omul rămâne client luna următoare. Vezi docs/reguli-domeniu.md.';

create index if not exists idx_enrollments_prorata
  on public.enrollments (cursul, client)
  where prorata;

-- Semnul mută bani (bonusuri), deci din browser se schimbă doar prin RPC-ul cu audit.
-- Insertul rămâne liber: aplicația îl pune la crearea înrolării.
create or replace function public._garda_enrollments_prorata()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.prorata is distinct from old.prorata and current_user in ('authenticated', 'anon') then
    raise exception 'Semnul „prorata" se schimbă doar din „Ajustează preț".' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public._garda_enrollments_prorata() from public, anon, authenticated;

drop trigger if exists trg_garda_enrollments_prorata on public.enrollments;
create trigger trg_garda_enrollments_prorata
  before update of prorata on public.enrollments
  for each row execute function public._garda_enrollments_prorata();

-- ── RPC: managerul pune / scoate semnul ─────────────────────────────────────────
create or replace function public.seteaza_prorata_inrolare(
  p_enrollment uuid,
  p_prorata boolean,
  p_motiv text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enr   enrollments%rowtype;
  v_curs  cursuri%rowtype;
  v_loc   uuid;
begin
  if not (is_manager() or is_admin()) then
    raise exception 'Doar managerii pot marca prorata.' using errcode = '42501';
  end if;
  if p_prorata is null then
    raise exception 'Alege dacă rata e prorata sau nu.';
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;

  select * into v_enr from enrollments where id = p_enrollment for update;
  if not found then
    raise exception 'Înrolarea nu mai există — probabil a fost ștearsă între timp. Reîncarcă pagina.';
  end if;
  select * into v_curs from cursuri where id = v_enr.cursul;
  if p_prorata and (v_enr.tip_plata <> 'Per luna' or coalesce(v_curs.facultativ, false)
                    or v_curs.nivelul = 'Trupa') then
    raise exception 'Prorata există doar la grupele recurente, pe rata lunară.';
  end if;
  if v_enr.prorata = p_prorata then
    return;
  end if;

  update enrollments set prorata = p_prorata, updated = now() where id = p_enrollment;

  select coalesce(v_curs.locatie, s.locatie) into v_loc from sali s where s.id = v_curs.sala;
  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         old_value, new_value, reason, locatie_id)
  values (auth.uid(), auth_role(), 'prorata_marcat', 'enrollment', p_enrollment,
          jsonb_build_object('prorata', v_enr.prorata),
          jsonb_build_object('prorata', p_prorata),
          btrim(p_motiv), coalesce(v_loc, v_curs.locatie));
end;
$$;

revoke execute on function public.seteaza_prorata_inrolare(uuid, boolean, text) from public, anon;
grant execute on function public.seteaza_prorata_inrolare(uuid, boolean, text) to authenticated, service_role;

-- ── Completare: septembrie și octombrie 2026 ──────────────────────────────────────
-- Lista validată cu Alex pe 9 oct. 2026 (50 de rate în septembrie, 5 în octombrie): rate lunare la
-- grupe recurente, începute după start și sub rata lunii următoare, plus ajustările de mână pentru
-- ședințe pierdute la intrare. Butnaru Iustina NU e aici (redusă pentru boală, intrată la timp).
with lista(id) as (
  values
    ('03407f30-2d01-41a9-9e29-ec03488c503a'::uuid), ('08393515-6a08-453a-8c15-5c56a700cbfe'),
    ('0ad76c36-f156-42a0-99e6-5dd1706e9478'), ('188ff85e-877a-42a6-827a-d075460f6cab'),
    ('1b0eb65c-9c9d-4f8d-9801-1b6ea720454c'), ('20791ac8-9934-4add-a46c-ba44090140e1'),
    ('221e0140-418c-405a-8428-0711048808f0'), ('26f7906a-f120-4dc7-b15a-669a422b24ed'),
    ('38f75972-e499-49ae-8118-26f7b27cdb5e'), ('477b7e18-850d-45cd-85cd-c486f21efd94'),
    ('47e64685-8c35-469b-9eb1-a47fd5f84adb'), ('5e79ab96-9141-4b80-9299-0a5eecd0f740'),
    ('60373d88-7cd5-4183-b330-605924425c75'), ('71e25f0f-948b-4a96-bcb2-e9c27dbef413'),
    ('76ff3d9b-f89c-449a-adb9-b44f4bb8a5c0'), ('7adc127a-3b75-45a3-91ee-1955b950697d'),
    ('7c7aa80c-a41e-494b-8279-fdeca4438db3'), ('808e0c1c-76e5-405c-bb1e-f6db990f3c3a'),
    ('849845dd-1ffb-4ac1-91eb-6131edb6d9a5'), ('8c7cefe8-7377-40f2-be46-9c65af6af6ec'),
    ('8d471893-4c5c-4c9c-a247-b854793a644e'), ('8ee42fdb-4ff9-4579-89d7-4fed62e023d5'),
    ('91e3065c-fbb6-4c17-928a-07472278a56d'), ('9d8c564a-eeec-4b57-a5ea-a2681db2ffa0'),
    ('9e06e52e-b55d-4fc8-b28d-c1fb2abf44a5'), ('a3bafb06-01ea-4e94-9dae-b93ec8c5d032'),
    ('a8167a55-4360-407f-8e8c-2d969e9be6dd'), ('af0429d1-1405-4e59-b47d-ee2a99da035a'),
    ('b66a9287-bf23-438a-9854-8ee9cb1b69b6'), ('b6b1c238-46f1-4545-afad-b8af2fc9ae8d'),
    ('b9db83ac-2f1c-4f44-9a2d-c3c13d93b275'), ('bcbd9bba-b037-429a-8ae0-266649358231'),
    ('be4c708b-a115-47b9-861f-58420ba373a6'), ('c5429a0a-519b-40fb-aaa9-31eaf4b97332'),
    ('cfaadd8b-7ccb-4436-866a-47177cf232a8'), ('d28a2f54-cce2-4add-b774-92417ecaf9d4'),
    ('d2f323ee-d750-4c24-a438-e96b737de266'), ('d615724c-406b-4693-8c48-9eb71f461518'),
    ('d880d94c-2a88-4b6b-a962-e3e0a2295df8'), ('e24258a2-8756-4066-bc26-8d5477234f99'),
    ('e4246d2a-835a-4262-978f-18ffbb86f5ed'), ('eabbd5de-f400-49e2-80d2-ae45693b3a08'),
    ('ee2c6514-04cc-4b48-9474-8a232aa26235'), ('ee6f972e-e18c-42fc-8f0f-638edcaae3eb'),
    ('f145cf2d-542c-4020-8f6e-619cd90d6fb7'), ('f27a516e-c4e9-4e83-a46f-59458efb8d6d'),
    ('f756d465-5dbb-48c0-8c36-94f27aab101f'), ('f9622e15-7485-4aa4-be0f-8621b16926ca'),
    ('f97b16b5-c23a-407a-bf31-433a7629335e'), ('fec783d4-0fb3-4463-9a47-4a0acce1fdf5'),
    -- octombrie, calculate de aplicație (Nicolina, start 12 oct.)
    ('e9167328-4f76-4909-adac-d677f4fe9296'), ('f4b84cea-777a-4660-a65c-7fcb27e80a3c'),
    ('9755be7c-9a55-4545-ba54-597a75595fd8'), ('b8dfbdbd-c401-42a0-874e-fcf98fe64486'),
    ('f79b0c90-aff1-460a-ac1d-a78c8ac94349')
),
marcate as (
  update enrollments e set prorata = true
  from lista l
  where e.id = l.id and not e.prorata
  returning e.id
)
insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason)
select null, 'service_role', 'prorata_marcat', 'enrollment', m.id,
       jsonb_build_object('prorata', false), jsonb_build_object('prorata', true),
       'Completare la introducerea regulii „prorata nu se numără la ocupare" (Alex, 9 oct. 2026).'
from marcate m;

-- ── Numărătoarea ─────────────────────────────────────────────────────────────────
-- `p_fara_prorata` scoate (client, grupă) când rata lui de prorata cade în interval și omul are
-- rată și luna următoare. Se folosește doar pe intervale de O LUNĂ (numărătoarea lunară).
drop function if exists public._locuri_ocupate(date, date, uuid[], boolean);
drop function if exists public._locuri_ponderate(date, date, uuid[], boolean);

create function public._locuri_ponderate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean,
  p_fara_prorata boolean default false
)
returns table(client uuid, curs_id uuid, pondere numeric, fel text,
              sedinte_platite integer, sedinte_tinute integer)
language sql
stable
set search_path to 'public'
as $function$
  with grupe as (
    select c.id, coalesce(c.facultativ, false) as facultativ, c.zile::text[] as zile,
           c.sezon, z.data_incepere as sezon_de, z.data_final as sezon_pana
    from cursuri c
    left join sezoane z on z.id = c.sezon
    where c.id = any(p_cursuri)
  ),
  fac as (select array_agg(g.id) as ids from grupe g where g.facultativ),
  fer as (select case when p_sedinta_30_zile then p_de - 29 else p_de end as de),
  intregi as (
    select distinct r.client, r.curs_id
    from _inrolari_platite_randuri(p_de, p_pana,
                                   array(select g.id from grupe g where not g.facultativ),
                                   p_sedinta_30_zile) r
    where not (
      p_fara_prorata
      and exists (
        select 1 from enrollments e
        where e.prorata and e.cursul = r.curs_id and e.client = r.client
          and e.suma > 0
          and e.data_incepere between p_de and p_pana
          -- rămâne client: are rată și luna următoare
          and exists (
            select 1 from enrollments n
            where n.cursul = e.cursul and n.client = e.client
              and n.suma > 0
              and n.data_incepere >= (date_trunc('month', e.data_incepere) + interval '1 month')::date
              and n.data_incepere < (date_trunc('month', e.data_incepere) + interval '2 month')::date
              and (n.data_reziliere is null or n.data_reziliere::date > n.data_incepere)
          )
      )
    )
  ),
  -- Facultativele se citesc o dată, pe toată fereastra ședințelor; abonamentul
  -- trebuie să atingă perioada propriu-zisă, nu fereastra.
  rand_fac as (
    select r.*
    from _inrolari_platite_randuri((select de from fer), p_pana, (select ids from fac), false) r
  ),
  abonati as (
    select distinct r.client, r.curs_id
    from rand_fac r
    where r.tip <> 'Per sedinta' and r.sfarsit >= greatest(r.data_incepere, p_de)
  ),
  sedinte as (
    select distinct r.client, r.curs_id, r.data_incepere as zi
    from rand_fac r
    where r.tip = 'Per sedinta'
  ),
  orar as (
    select g.id as curs_id, d::date as zi
    from grupe g
    cross join fer
    cross join lateral generate_series(
      greatest(fer.de, coalesce(g.sezon_de, fer.de)),
      least(p_pana, coalesce(g.sezon_pana, p_pana)),
      interval '1 day') d
    where g.facultativ
      and (array['Luni','Marti','Miercuri','Joi','Vineri','Sambata','Duminica'])[extract(isodow from d)::int]
          = any(g.zile)
      and not exists (select 1 from vacante v
                      where v.sezon_id = g.sezon and d::date between v.data_incepere and v.data_final)
      and curs_activ_in_luna(g.id, d::date)
  ),
  tinute as (
    select x.curs_id, count(*)::int as n
    from (select o.curs_id, o.zi from orar o
          union
          select s.curs_id, s.zi from sedinte s) x
    group by x.curs_id
  ),
  pe_sedinta as (
    select s.client, s.curs_id, count(*)::int as n
    from sedinte s
    where not exists (select 1 from abonati a where a.client = s.client and a.curs_id = s.curs_id)
    group by s.client, s.curs_id
  )
  select i.client, i.curs_id, 1::numeric, 'loc'::text, null::int, null::int
  from intregi i
  union all
  select a.client, a.curs_id, 1::numeric, 'abonament', null::int, t.n
  from abonati a
  left join tinute t on t.curs_id = a.curs_id
  union all
  select p.client, p.curs_id, least(1, p.n::numeric / t.n), 'sedinte', p.n, t.n
  from pe_sedinta p
  join tinute t on t.curs_id = p.curs_id;
$function$;

create function public._locuri_ocupate(
  p_de date,
  p_pana date,
  p_cursuri uuid[],
  p_sedinta_30_zile boolean,
  p_fara_prorata boolean default false
)
returns table(curs_id uuid, ocupate numeric)
language sql
stable
set search_path to 'public'
as $function$
  select lp.curs_id, round(sum(lp.pondere), 2)
  from _locuri_ponderate(p_de, p_pana, p_cursuri, p_sedinta_30_zile, p_fara_prorata) lp
  group by lp.curs_id;
$function$;

-- Luna = numărătoarea pentru bani și praguri: bonusul managerului, pragul minim, maturitatea,
-- fișa cursului pe o lună încheiată. Fără prorata.
create or replace function public.locuri_ocupate_luna(p_luna date, p_cursuri uuid[])
returns table(curs_id uuid, ocupate numeric)
language sql
stable
set search_path to 'public'
as $function$
  select * from _locuri_ocupate(
    date_trunc('month', p_luna)::date,
    (date_trunc('month', p_luna) + interval '1 month' - interval '1 day')::date,
    p_cursuri,
    false,
    true
  );
$function$;

revoke all on function public._locuri_ponderate(date, date, uuid[], boolean, boolean) from public, anon;
grant execute on function public._locuri_ponderate(date, date, uuid[], boolean, boolean) to authenticated, service_role;
revoke all on function public._locuri_ocupate(date, date, uuid[], boolean, boolean) from public, anon;
grant execute on function public._locuri_ocupate(date, date, uuid[], boolean, boolean) to authenticated, service_role;

-- ── Salariul instructorului: ocuparea fără prorata, retenția neatinsă ─────────────────
-- Schimbarea e un singur apel (locurile lunii M); restul funcției rămâne cum e live.
do $$
declare
  v_def text := pg_get_functiondef('public.calculeaza_salariu_teacher(uuid, integer, integer)'::regprocedure);
  v_vechi text := 'from _locuri_ponderate(v_m, v_m_fin, v_ids, false) lp group by lp.curs_id';
  v_nou text := 'from _locuri_ponderate(v_m, v_m_fin, v_ids, false, true) lp group by lp.curs_id';
begin
  if position(v_vechi in v_def) = 0 then
    raise exception 'calculeaza_salariu_teacher: n-am găsit apelul locurilor lunii — definiția s-a schimbat.';
  end if;
  execute replace(v_def, v_vechi, v_nou);
end;
$$;

-- ── Detaliul de la salariu (admin): cine e numărat, cine e prorata ──────────────────────
-- Înlocuiește euristica din 7 oct. (suma sub prețul plin), care punea la prorata și reducerile
-- comerciale (ex. „reducere zpd" 220). Acum prorata = semnul de pe rând + omul rămâne client,
-- exact ce scade din numărătoare.
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
    select id from cursuri
    where id = any(p_cursuri) and not coalesce(facultativ, false)
  ),
  r as (
    select distinct x.client, x.curs_id as cursul, x.tip, x.data_incepere
    from _inrolari_platite_randuri(v_de, v_pana, (select array_agg(id) from c), false) x
  ),
  om as (
    select e.cursul, e.client, sum(e.suma) as suma
    from enrollments e
    join r on r.client = e.client and r.cursul = e.cursul
          and r.data_incepere = e.data_incepere and r.tip = e.tip_plata::text
    where e.suma > 0
    group by e.cursul, e.client
  ),
  numarati as (
    select lp.client, lp.curs_id as cursul
    from _locuri_ponderate(v_de, v_pana, (select array_agg(id) from c), false, true) lp
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
    select om.cursul, om.client, om.suma,
           coalesce(prez.n, 0) as prezente,
           exists (select 1 from numarati n where n.cursul = om.cursul and n.client = om.client) as numarat,
           btrim(concat_ws(' ', cl.prenume, cl.nume)) as nume
    from om
    left join prez on prez.cursul = om.cursul and prez.client = om.client
    left join clienti cl on cl.id = om.client
  )
  select coalesce(jsonb_object_agg(t.cursul, t.x), '{}'::jsonb) into v_out
  from (
    select cursul, jsonb_build_object(
      'numarati', count(*) filter (where numarat),
      'prorata', count(*) filter (where not numarat),
      'suma_numarati', coalesce(sum(suma) filter (where numarat), 0),
      'suma_prorata', coalesce(sum(suma) filter (where not numarat), 0),
      'prezente_prorata', coalesce(sum(prezente) filter (where not numarat), 0),
      'lista_prorata', coalesce(jsonb_agg(jsonb_build_object(
          'client_id', client, 'nume', nume, 'suma', suma, 'prezente', prezente)
        order by suma, nume) filter (where not numarat), '[]'::jsonb)
    ) as x
    from cls
    group by cursul
  ) t;

  return v_out;
end;
$$;

revoke execute on function public.detaliu_cursanti_salariu(uuid[], int, int) from public, anon;
grant execute on function public.detaliu_cursanti_salariu(uuid[], int, int) to authenticated, service_role;
