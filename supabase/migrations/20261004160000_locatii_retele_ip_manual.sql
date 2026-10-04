-- Asocierea rețelei acceptă și un IP scris de mână: rețeaua de la Kids e văzută în
-- jurnale (Theodora), dar ownerul nu stă acolo ca s-o asocieze „de pe loc".

drop function if exists public.asociaza_reteaua_curenta(uuid, text);

create or replace function public.asociaza_retea_locatie(
  p_locatie uuid,
  p_eticheta text default null,
  p_ip text default null
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_ip inet;
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Doar adminii pot asocia rețele cu locațiile.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_ip, '')), '') is null then
    v_ip := _ip_apelant();
    if v_ip is null then
      raise exception 'Nu pot afla IP-ul rețelei de acum.';
    end if;
  else
    begin
      v_ip := btrim(p_ip)::inet;
    exception when others then
      raise exception 'IP-ul „%" nu e valid (exemplu: 86.124.55.150).', btrim(p_ip);
    end;
  end if;
  insert into locatii_retele (ip, locatie, eticheta)
  values (v_ip, p_locatie, nullif(btrim(coalesce(p_eticheta, '')), ''))
  on conflict (ip) do update set locatie = excluded.locatie, eticheta = excluded.eticheta;
  return host(v_ip);
end;
$$;

revoke execute on function public.asociaza_retea_locatie(uuid, text, text) from anon, public;
grant execute on function public.asociaza_retea_locatie(uuid, text, text) to authenticated;
