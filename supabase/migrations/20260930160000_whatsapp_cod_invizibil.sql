-- Codul de WhatsApp devine INVIZIBIL (Alex, 30.09.2026): „(ref Q-7K3MP)" la finalul mesajului
-- putea fi șters de om ca să arate mai frumos. Site-ul îl scrie acum cu caractere de lățime
-- zero, după primul „!" al mesajului — vezi `invisibleWaCode` în quasar-dance/lib/attribution.ts.
--
-- Codare: fiecare caracter al codului = poziția lui în alfabetul de mai jos (0–30), în baza 4
-- pe 3 cifre; cifrele 0–3 = U+200B, U+200C, U+200D, U+2060 → 15 caractere invizibile.
-- Alfabetul și ordinea cifrelor trebuie să rămână identice cu site-ul.
--
-- Formatul vizibil („Q-XXXXX" sau codul singur) rămâne recunoscut: click-urile de azi îl au.
create or replace function public.leaga_click_whatsapp(p_text text, p_lead uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_alfabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_text text := upper(coalesce(p_text, ''));
  v_run  text;
  v_cod  text;
  v_i    int;
  v_c    whatsapp_clickuri;
begin
  if (select auth_role()) in ('parinte', 'marketing', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  -- 15 invizibile la rând nu apar întâmplător; un ZWJ din emoji-uri e singur.
  v_run := substring(coalesce(p_text, '') from '[​‌‍⁠]{15}');
  if v_run is not null then
    v_run := translate(v_run, E'​‌‍⁠', '0123');
    v_cod := '';
    for k in 0..4 loop
      v_i := substr(v_run, k * 3 + 1, 1)::int * 16
           + substr(v_run, k * 3 + 2, 1)::int * 4
           + substr(v_run, k * 3 + 3, 1)::int;
      if v_i > 30 then
        v_cod := null;
        exit;
      end if;
      v_cod := v_cod || substr(v_alfabet, v_i + 1, 1);
    end loop;
  end if;

  if v_cod is null then
    v_cod := substring(v_text from 'Q-([A-HJ-NP-Z2-9]{5})(?![A-Z0-9])');
  end if;
  if v_cod is null then
    v_cod := substring(v_text from '^\s*Q?-?([A-HJ-NP-Z2-9]{5})\s*$');
  end if;
  if v_cod is null then
    return jsonb_build_object('gasit', false, 'motiv', 'fara_cod');
  end if;

  select * into v_c from whatsapp_clickuri
   where cod = v_cod and created > now() - interval '90 days'
   order by created desc limit 1;
  if v_c.id is null then
    return jsonb_build_object('gasit', false, 'motiv', 'cod_necunoscut', 'cod', v_cod);
  end if;

  if p_lead is not null then
    update leads set
      wa_click_id  = v_c.id,
      utm_source   = v_c.utm_source,
      utm_medium   = v_c.utm_medium,
      utm_campaign = v_c.utm_campaign,
      gclid        = coalesce(v_c.gclid, gclid)
    where id = p_lead;
    if not found then
      raise exception 'Leadul nu există.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'gasit', true,
    'cod', v_c.cod,
    'click_id', v_c.id,
    'click_la', v_c.created,
    'pagina', v_c.pagina,
    'utm_source', v_c.utm_source,
    'utm_medium', v_c.utm_medium,
    'utm_campaign', v_c.utm_campaign,
    'are_gclid', v_c.gclid is not null
  );
end $$;

revoke execute on function public.leaga_click_whatsapp(text, uuid) from anon, public;
grant execute on function public.leaga_click_whatsapp(text, uuid) to authenticated;
