-- Walk-in la o clasa demo: cineva vine la receptie fara sa aiba fisa.
--
-- Regula formulata de Alex: la demo se inscriu NON-clienti, iar acestia „ar trebui
-- sa fie leads". Deci walk-in-ul nu e un rand liber cu nume+telefon, ci un lead
-- adevarat, care intra in pipeline si primeste acelasi SMS de confirmare.
--
-- Dedup pe ULTIMELE 9 CIFRE: `leads.telefon` are format inconsistent (0740…,
-- +40740…, 0740 123 456) — acelasi criteriu ca in
-- 20260715130000_backfill_deja_client_normalize_tel.sql.

create or replace function creeaza_lead_si_inscrie_la_demo(
  p_eveniment        uuid,
  p_nume             text,
  p_telefon          text,
  p_prenume          text    default null,
  p_varsta           int     default null,
  p_interes          text    default null,
  p_adus_de          uuid    default null,
  p_sursa            text    default 'walk_in',
  p_permite_overbook boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_lead   uuid;
  v_creat  boolean := false;
  v_deja   boolean := false;
  v_tel9   text;
begin
  if auth_role() not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces interzis.';
  end if;
  if coalesce(btrim(p_nume), '') = '' then
    raise exception 'Numele e obligatoriu.';
  end if;

  v_tel9 := right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 9);
  if length(v_tel9) < 9 then
    raise exception 'Telefon invalid.';
  end if;

  select * into e from evenimente where id = p_eveniment;
  if not found then
    raise exception 'Evenimentul nu exista.';
  end if;

  select id into v_lead
    from leads
   where right(regexp_replace(coalesce(telefon, ''), '\D', '', 'g'), 9) = v_tel9
   order by created desc
   limit 1;

  if v_lead is null then
    insert into leads (nume, prenume, telefon, varsta, interes, status, sursa, locatia)
    values (
      btrim(p_nume),
      nullif(btrim(coalesce(p_prenume, '')), ''),
      btrim(p_telefon),
      p_varsta,
      nullif(p_interes, '')::interes_lead,
      'nou',
      e.campanie,
      (select nume from locatii where id = e.locatie_id)
    )
    returning id into v_lead;
    v_creat := true;
  else
    v_deja := exists (
      select 1 from programari_leads
       where lead = v_lead and eveniment_programat = p_eveniment
    );
  end if;

  perform inscrie_la_demo(p_eveniment, v_lead, null, p_sursa, p_adus_de, p_permite_overbook);

  return jsonb_build_object('lead_id', v_lead, 'created', v_creat, 'deja_inscris', v_deja);
end;
$$;

revoke execute on function creeaza_lead_si_inscrie_la_demo(uuid, text, text, text, int, text, uuid, text, boolean) from anon, public;
grant  execute on function creeaza_lead_si_inscrie_la_demo(uuid, text, text, text, int, text, uuid, text, boolean) to authenticated;
