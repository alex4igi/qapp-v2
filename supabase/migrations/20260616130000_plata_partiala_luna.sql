-- Portal membri — plată PARȚIALĂ pe lună (înrolare), cu gardă cronologică.
-- Înainte: build_fifo_plan_membru plătea TOATĂ restanța. Acum membrul poate alege
-- până la ce lună plătește, dar NU poate sări peste o lună mai veche neachitată
-- (nu poate plăti februarie dacă ianuarie are rest). Implementăm cutoff pe dată:
-- se plătesc toate înrolările cu rest > 0 și data_incepere <= data înrolării alese.
--
-- Plus: get_plati_client expune sezonul (pt grupare în UI, ca la portalul twinklestar).

-- ============================================================
-- 1) Plan FIFO cu cutoff opțional (p_pana_la = înrolarea-limită; null => toată restanța)
--    Dropăm semnătura veche cu 1 argument ca să nu rămână overload ambiguu pt PostgREST.
-- ============================================================
drop function if exists build_fifo_plan_membru(uuid);

create or replace function build_fifo_plan_membru(p_client uuid, p_pana_la uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan jsonb;
  v_amount numeric;
  v_cutoff_date date;
begin
  if p_client not in (select client_member_ids()) then
    raise exception 'forbidden: clientul nu aparține familiei contului';
  end if;

  -- Dacă s-a ales o lună-limită, rezolvă data ei (trebuie să fie a clientului și cu rest).
  if p_pana_la is not null then
    select t.data_incepere into v_cutoff_date
    from plati_inrolari t
    where t.id_enrollment = p_pana_la and t.id_cursant = p_client and t.rest > 0;
    if not found then
      raise exception 'Înrolarea selectată nu există sau e deja achitată.';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', t.id_enrollment, 'pay', t.rest)
                            order by t.data_incepere asc nulls last, t.id_enrollment), '[]'::jsonb),
         coalesce(sum(t.rest), 0)
    into v_plan, v_amount
  from plati_inrolari t
  where t.id_cursant = p_client
    and t.rest > 0
    and (p_pana_la is null or t.data_incepere <= v_cutoff_date);

  return jsonb_build_object('amount', v_amount, 'plan', v_plan);
end;
$$;

grant execute on function build_fifo_plan_membru(uuid, uuid) to authenticated;

-- ============================================================
-- 2) get_plati_client + sezon (id + nume) pt grupare în UI
--    Drop întâi: CREATE OR REPLACE nu poate schimba coloanele TABLE de retur.
-- ============================================================
drop function if exists get_plati_client(uuid);

create or replace function get_plati_client(p_client uuid)
returns table (
  enrollment_id uuid,
  curs_nume text,
  data_incepere date,
  tip_plata tip_plata,
  total_de_plata numeric,
  platit numeric,
  rest numeric,
  cod_voucher text,
  sezon_id uuid,
  sezon_nume text
)
language sql stable security definer set search_path = public as $$
  select pi.id_enrollment, pi.nume_curs, pi.data_incepere, pi.tip_plata,
         pi.total_de_plata, pi.platit, pi.rest, pi.cod_voucher,
         c.sezon, sz.numele_sezonului
  from plati_inrolari pi
  left join cursuri c on c.id = pi.id_curs
  left join sezoane sz on sz.id = c.sezon
  where pi.id_cursant = p_client
    and p_client in (select client_member_ids())
  order by pi.data_incepere asc nulls last, pi.id_enrollment;
$$;
