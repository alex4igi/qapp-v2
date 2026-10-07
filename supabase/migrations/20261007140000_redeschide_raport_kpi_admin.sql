-- Redeschiderea unei luni KPI închise: și adminii, nu doar owner-ul (Alex, 7 oct. 2026 — adminul face
-- salarizarea, vezi docs/procedura-salarizare-admin.html). Motivul devine obligatoriu: rămâne în audit_log
-- împreună cu valorile înghețate care se șterg.

create or replace function public.redeschide_raport_kpi(p_raport uuid, p_motiv text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_r raport_kpi_lunar;
begin
  if not is_admin() then
    raise exception 'Doar adminii pot redeschide o lună închisă.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul redeschiderii e obligatoriu.' using errcode = '22023';
  end if;

  select * into v_r from raport_kpi_lunar where id = p_raport;
  if not found then
    raise exception 'Raportul nu există' using errcode = 'P0002';
  end if;
  if v_r.stare <> 'inchis' then
    raise exception 'Luna nu e închisă' using errcode = '22023';
  end if;

  insert into audit_log (actor_id, actor_role, entity_type, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), auth_role(), 'raport_kpi', p_raport, 'update',
          jsonb_build_object('stare', 'inchis', 'bonus', v_r.bonus_titular,
                             'kpi', v_r.kpi, 'config_aplicata', v_r.config_aplicata),
          jsonb_build_object('stare', 'draft'), btrim(p_motiv));

  update raport_kpi_lunar
     set stare = 'draft', kpi = null, config_aplicata = null,
         bonus_titular = null, fond_total = null, cota_manager = null,
         pondere_totala_configurata = null,
         inchis_de = null, inchis_la = null, updated = now()
   where id = p_raport;
end;
$$;

revoke execute on function public.redeschide_raport_kpi(uuid, text) from anon, public;
grant execute on function public.redeschide_raport_kpi(uuid, text) to authenticated;
