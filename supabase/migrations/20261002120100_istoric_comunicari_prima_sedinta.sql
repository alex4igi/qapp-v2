-- Istoricul comunicărilor: intră și reminderul înainte de prima ședință
-- (`remindere_prima_sedinta`, tabel nou din 20261002100000), care nu are text
-- salvat — doar tipul, cursul și data ședinței.

create or replace function get_istoric_comunicari(
  p_client  uuid default null,
  p_familie uuid default null
)
returns table (
  moment       timestamptz,
  canal        text,
  tip          text,
  status       text,
  mesaj        text,
  destinatar   text,
  pentru       text,
  autor        text,
  detalii      jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_familie uuid := p_familie;
  v_membri  uuid[];
  v_tel     text[];
  v_email   text[];
  v_leads   uuid[];
begin
  if (select auth_role()) in ('parinte', 'marketing', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  if v_familie is null and p_client is not null then
    select c.familia into v_familie from clienti c where c.id = p_client;
  end if;

  if v_familie is not null then
    select array_agg(c.id) into v_membri from clienti c where c.familia = v_familie;
  end if;
  if p_client is not null then
    v_membri := array(select distinct x from unnest(coalesce(v_membri, '{}') || p_client) x);
  end if;
  if coalesce(cardinality(v_membri), 0) = 0 then
    return;
  end if;

  select array_agg(distinct t) into v_tel
  from (
    select right(regexp_replace(x, '\D', '', 'g'), 9) as t
    from (
      select c.telefon as x from clienti c where c.id = any (v_membri)
      union all select c.telefonul_2 from clienti c where c.id = any (v_membri)
      union all select f.telefon from familii f where f.id = v_familie
      union all select f.telefon_2 from familii f where f.id = v_familie
    ) s
  ) n
  where length(t) = 9;

  select array_agg(distinct e) into v_email
  from (
    select lower(trim(x)) as e
    from (
      select c.email as x from clienti c where c.id = any (v_membri)
      union all select f.email from familii f where f.id = v_familie
    ) s
  ) n
  where e like '%@%';

  select array_agg(l.id) into v_leads
  from leads l
  where l.id_client = any (v_membri)
     or right(regexp_replace(coalesce(l.telefon, ''), '\D', '', 'g'), 9) = any (coalesce(v_tel, '{}'));

  v_tel   := coalesce(v_tel, '{}');
  v_email := coalesce(v_email, '{}');
  v_leads := coalesce(v_leads, '{}');

  return query
  with staff as (
    select u.id,
           coalesce(nullif(trim(concat_ws(' ', t.prenume, t.nume)), ''), split_part(u.email, '@', 1)) as nume
    from auth.users u
    left join lateral (
      select t.prenume, t.nume from teacheri t where t.auth_user_id = u.id limit 1
    ) t on true
  ),
  nume_lead as (
    select l.id, nullif(trim(concat_ws(' ', l.prenume, l.nume)), '') as nume
    from leads l where l.id = any (v_leads)
  ),
  nume_client as (
    select c.id, nullif(trim(concat_ws(' ', c.prenume, c.nume)), '') as nume
    from clienti c where c.id = any (v_membri)
  )
  -- SMS de lead
  select s.trimis_la, 'sms'::text, s.tip,
         case s.status when 'sent' then 'trimis' when 'failed' then 'esuat' else s.status end,
         s.mesaj, s.telefon, nl.nume, null::text,
         jsonb_build_object('eroare', s.error)
  from sms_logs s
  left join nume_lead nl on nl.id = s.lead_id
  where s.lead_id = any (v_leads)
     or right(regexp_replace(coalesce(s.telefon, ''), '\D', '', 'g'), 9) = any (v_tel)

  union all
  -- SMS din /sms și de contract
  select coalesce(
           case when ss.data_trimitere is not null and ss.data_trimitere <> ss.created::date
                then (ss.data_trimitere + time '12:00') at time zone 'Europe/Bucharest' end,
           ss.created),
         'sms', ss.cod_mesaj,
         case ss.status::text when 'Trimis' then 'trimis' when 'Esuat' then 'esuat' else 'programat' end,
         ss.mesaj, ss.telefon,
         (select string_agg(nc.nume, ', ') from nume_client nc where nc.id = any (ss.clienti_vizati)),
         null, null
  from situatie_sms_uri ss
  where ss.clienti_vizati && v_membri
     or right(regexp_replace(coalesce(ss.telefon, ''), '\D', '', 'g'), 9) = any (v_tel)

  union all
  -- SMS-uri amânate care nu sunt deja în celelalte jurnale (ex. trimiteri manuale din august)
  select coalesce(a.trimis_la, a.send_after), 'sms', a.tip,
         case a.status when 'trimis' then 'trimis' when 'esuat' then 'esuat' else 'programat' end,
         a.mesaj, a.telefon, null, null,
         jsonb_build_object('eroare', a.error)
  from sms_amanate a
  where a.lead_id is null and a.sursa_id is null
    and right(regexp_replace(coalesce(a.telefon, ''), '\D', '', 'g'), 9) = any (v_tel)

  union all
  -- Confirmarea înrolării
  select coalesce(ci.trimis_la, ci.send_after), 'sms', 'confirmare_inrolare', ci.status,
         ci.mesaj, ci.telefon, nc.nume, null,
         jsonb_build_object('eroare', ci.error)
  from confirmari_inrolare_sms ci
  join enrollments e on e.id = ci.enrollment_id
  left join nume_client nc on nc.id = e.client
  where e.client = any (v_membri)

  union all
  -- Reminderul înainte de prima ședință (start de sezon / ziua dinainte)
  select r.creat, 'sms', r.tip, r.status, null, null, nc.nume, null,
         jsonb_build_object('data_sedinta', r.data_sedinta, 'curs', cu.numele, 'eroare', r.error)
  from remindere_prima_sedinta r
  left join cursuri cu on cu.id = r.curs_id
  left join nume_client nc on nc.id = r.client_id
  where r.client_id = any (v_membri)

  union all
  select el.trimis_la, 'email', el.tip, el.status, el.subject, el.to_email,
         coalesce(nc.nume, nl.nume), null,
         jsonb_build_object('eroare', el.error)
  from email_logs el
  left join nume_client nc on nc.id = el.client_id
  left join nume_lead nl on nl.id = el.lead_id
  where el.client_id = any (v_membri)
     or el.familia_id = v_familie
     or el.lead_id = any (v_leads)
     or lower(trim(el.to_email)) = any (v_email)

  union all
  -- Contacte logate de echipă pe client
  select cc.created, 'contact', cc.scop, cc.rezultat::text, cc.observatii, null, nc.nume, st.nume,
         jsonb_build_object(
           'canal', cc.canal,
           'suma_promisa', cc.suma_promisa,
           'promisiune_data', cc.promisiune_data)
  from client_contacte cc
  left join nume_client nc on nc.id = cc.client_id
  left join staff st on st.id = cc.user_id
  where cc.client_id = any (v_membri)

  union all
  -- Contacte pe leadurile familiei
  select lc.created, 'contact', 'lead', lc.rezultat::text, lc.observatii, null, nl.nume, st.nume,
         jsonb_build_object('canal', lc.canal, 'dedus', lc.dedus)
  from lead_contacte lc
  left join nume_lead nl on nl.id = lc.lead_id
  left join staff st on st.id = lc.user_id
  where lc.lead_id = any (v_leads)

  union all
  select ce.created, 'contract', ce.tip, null, null, null, nc.nume, null, null
  from contract_events ce
  join contracte k on k.id = ce.contract_id
  left join nume_client nc on nc.id = k.client_id
  where ce.tip in ('email_trimis', 'deschis', 'semnat')
    and (k.client_id = any (v_membri) or k.familie_id = v_familie)

  union all
  select an.created, 'anunt', an.canal,
         case when ac.read_at is not null then 'citit' else 'necitit' end,
         an.titlu, null, nc.nume, null,
         jsonb_build_object('citit_la', ac.read_at)
  from anunturi_clienti ac
  join anunturi an on an.id = ac.anunt_id
  left join nume_client nc on nc.id = ac.client_id
  where ac.client_id = any (v_membri)

  order by 1 desc nulls last;
end;
$$;

revoke execute on function get_istoric_comunicari(uuid, uuid) from anon, public;
grant execute on function get_istoric_comunicari(uuid, uuid) to authenticated;
