-- Atribuirea leadurilor venite pe WhatsApp (Alex, 30.09.2026).
--
-- GA4 vede click-ul pe butonul de WhatsApp și știe de unde a venit omul (Google Ads, căutare,
-- Facebook), dar în clipa în care trece în WhatsApp legătura se rupe: la recepție ajunge doar
-- un număr de telefon, iar leadul primește sursa „WhatsApp” fără canal, campanie sau gclid.
--
-- Site-ul pune acum un cod scurt în mesajul precompletat („… (ref Q-7K3MP)”) și trimite, pe
-- același drum server-server ca înscrierile (`intake-wa-click`, cu INTAKE_SECRET), codul +
-- atribuirea sesiunii. Recepția lipește primul mesaj în fișa leadului, iar
-- `leaga_click_whatsapp` copiază atribuirea pe lead.
--
-- Legătura stă pe lead (`wa_click_id`), nu pe click: un părinte care scrie o dată pentru doi
-- copii devine două leaduri din același click.
-- Click-urile fără lead sunt la fel de utile: arată câte conversații n-au ajuns în CRM.

create table public.whatsapp_clickuri (
  id             uuid primary key default gen_random_uuid(),
  cod            text not null check (cod ~ '^[A-HJ-NP-Z2-9]{5}$'),
  created        timestamptz not null default now(),
  pagina         text check (length(pagina) <= 200),
  referrer_host  text check (length(referrer_host) <= 200),
  utm_source     text check (length(utm_source) <= 200),
  utm_medium     text check (length(utm_medium) <= 200),
  utm_campaign   text check (length(utm_campaign) <= 200),
  utm_content    text check (length(utm_content) <= 200),
  -- Doar cu consimțământ de marketing pe site (îl decide site-ul, nu serverul).
  gclid          text check (length(gclid) <= 300)
);

-- Codurile sunt aleatorii (31^5 ≈ 28 mil.); căutarea ia cel mai recent click cu codul dat.
create index whatsapp_clickuri_cod_idx on public.whatsapp_clickuri (cod, created desc);
create index whatsapp_clickuri_created_idx on public.whatsapp_clickuri (created);

alter table public.leads
  add column wa_click_id uuid references public.whatsapp_clickuri(id) on delete set null;
create index leads_wa_click_id_idx on public.leads (wa_click_id) where wa_click_id is not null;

-- ============================================================
-- RLS, granturi, gărzi (AGENTS.md)
-- ============================================================
-- Scrierea: doar edge function-ul (service_role). Citirea: staff-ul de birou.
-- Marketing (agenția): deny total — rândurile se leagă de leaduri, adică de oameni.
alter table public.whatsapp_clickuri enable row level security;

revoke all on public.whatsapp_clickuri from anon, authenticated, public;
grant select on public.whatsapp_clickuri to authenticated;
grant all on public.whatsapp_clickuri to service_role;

create policy whatsapp_clickuri_select on public.whatsapp_clickuri
  for select to authenticated using (true);
create policy deny_parinte_direct on public.whatsapp_clickuri as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.whatsapp_clickuri as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.whatsapp_clickuri as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

-- ============================================================
-- Legarea unui lead de click (o cheamă fișa de lead)
-- ============================================================
-- `p_text` = primul mesaj lipit de recepție sau doar codul. Cu `p_lead` null doar caută
-- (previzualizarea din fișă, înainte de salvare).
--
-- Codul se recunoaște DOAR ca „Q-XXXXX” sau singur: fără cratimă, „QUASAR” din chiar
-- textul mesajului ar da codul „UASAR”.
create or replace function public.leaga_click_whatsapp(p_text text, p_lead uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_text text := upper(coalesce(p_text, ''));
  v_cod  text;
  v_c    whatsapp_clickuri;
begin
  if (select auth_role()) in ('parinte', 'marketing', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  v_cod := substring(v_text from 'Q-([A-HJ-NP-Z2-9]{5})(?![A-Z0-9])');
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
