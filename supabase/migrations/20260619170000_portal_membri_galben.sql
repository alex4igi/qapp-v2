-- Portal membri — grup galben: RPC-uri de citire client-facing pentru
--   #22/23 evaluări instructor (progres copil + feedback)
--   #20 reduceri aplicate familiei
--   #36 anunțuri pe canalul client (clopoțel)
-- Toate SECURITY DEFINER, scopate pe client_member_ids().

-- ─────────────────────────────────────────────────────────────
-- #22/23 — Evaluările (raport skill 1-5 + feedback) ale unui copil.
-- ─────────────────────────────────────────────────────────────
create or replace function get_evaluari_client(p_client uuid)
returns table (
  id uuid, data date, curs_nume text, teacher_nume text, nivel_grupa text, feedback_general text,
  skill_ritm integer, skill_pasi_baza integer, skill_coregrafie integer, skill_izolari integer,
  skill_coordonare integer, skill_freeze integer, skill_sincronizare integer,
  skill_improvizatie integer, skill_expresivitate integer, skill_prezentare integer
)
language sql stable security definer set search_path = public as $$
  select e.id, e.data_evaluarii::date, c.numele, t.nume, e.nivel_grupa, e.feedback_general,
    e.skill_ritm, e.skill_pasi_baza, e.skill_coregrafie, e.skill_izolari, e.skill_coordonare,
    e.skill_freeze, e.skill_sincronizare, e.skill_improvizatie, e.skill_expresivitate, e.skill_prezentare
  from evaluari e
  left join cursuri c on c.id = e.cursul
  left join teacheri t on t.id = e.teacher
  where e.client = p_client and p_client in (select client_member_ids())
  order by e.data_evaluarii desc nulls last;
$$;

-- ─────────────────────────────────────────────────────────────
-- #20 — Reducerile aplicate ÎN PREZENT pe înrolările active ale familiei
-- (politică automată family/cross-sell prin suma_baza→suma, sau voucher).
-- ─────────────────────────────────────────────────────────────
create or replace function get_reduceri_familie()
returns table (
  client_id uuid, client_nume text, curs_nume text, tip_plata tip_plata,
  suma_baza numeric, suma numeric, reducere numeric, cod_voucher text
)
language sql stable security definer set search_path = public as $$
  select e.client, cl.nume || coalesce(' ' || cl.prenume, ''), c.numele, e.tip_plata,
    e.suma_baza, e.suma,
    greatest(0, coalesce(e.suma_baza, 0) - coalesce(e.suma, e.suma_baza, 0)),
    v.cod_voucher
  from enrollments e
  join clienti cl on cl.id = e.client
  left join cursuri c on c.id = e.cursul
  left join vouchere v on v.id = e.voucher
  where e.client in (select client_member_ids())
    and e.activ = true and e.reziliat = false
    and (e.data_final is null or e.data_final::date >= current_date)
    and (coalesce(e.suma_baza, 0) - coalesce(e.suma, e.suma_baza, 0) > 0 or e.voucher is not null)
  order by cl.nume, c.numele;
$$;

-- ─────────────────────────────────────────────────────────────
-- #36 — Anunțuri pe canalul CLIENT pentru membrii familiei (clopoțel).
-- read_at agregat: necitit dacă vreun rând al familiei e necitit.
-- ─────────────────────────────────────────────────────────────
create or replace function get_anunturi_client()
returns table (id uuid, titlu text, continut text, created timestamptz, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.titlu, a.continut, a.created,
    case when bool_or(ac.read_at is null) then null::timestamptz else max(ac.read_at) end
  from anunturi a
  join anunturi_clienti ac on ac.anunt_id = a.id
  where a.canal = 'client' and ac.client_id in (select client_member_ids())
  group by a.id, a.titlu, a.continut, a.created
  order by a.created desc;
$$;

create or replace function mark_anunturi_citite()
returns void
language sql volatile security definer set search_path = public as $$
  update anunturi_clienti set read_at = now()
  where read_at is null and client_id in (select client_member_ids());
$$;

grant execute on function get_evaluari_client(uuid) to authenticated;
grant execute on function get_reduceri_familie() to authenticated;
grant execute on function get_anunturi_client() to authenticated;
grant execute on function mark_anunturi_citite() to authenticated;
