-- Lista de pe /sms arăta doar coada `situatie_sms_uri` (plăți, restanțe, contracte),
-- iar SMS-urile automate de leaduri și înscrieri stăteau în alte jurnale, nevăzute de
-- recepție. Funcția le adună într-o listă, cu statusul adus la etichetele cozii.
--
-- Fără dubluri: un SMS de lead trimis apare o singură dată, în `sms_logs`. Din cozile
-- cu retry (`confirmari_programare_sms`, `confirmari_review_sms`, `sms_amanate`) intră
-- doar ce NU ajunge în `sms_logs`: cele planificate, eșuate sau anulate. Un rând amânat
-- din coada /sms (`sms_amanate.sursa_id`) e deja în `situatie_sms_uri`.
--
-- security definer: `remindere_prima_sedinta` n-are politică de citire pentru staff.

create or replace function get_jurnal_sms(
  p_tip    text default null,
  p_status text default null,
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (
  sursa          text,
  id             uuid,
  tip            text,
  status         text,
  telefon        text,
  mesaj          text,
  pentru         text,
  clienti_vizati uuid[],
  planificat     timestamptz,
  trimis_la      timestamptz,
  eroare         text,
  total          bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth_role()) in ('parinte', 'marketing', 'teacher') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  return query
  with
  nume_lead as (
    select l.id, nullif(trim(concat_ws(' ', l.nume, l.prenume)), '') as nume from leads l
  ),
  nume_client as (
    select c.id, nullif(trim(concat_ws(' ', c.nume, c.prenume)), '') as nume from clienti c
  ),
  toate as (
    select 'coada'::text as sursa, ss.id, ss.cod_mesaj as tip, ss.status::text as status,
           ss.telefon, ss.mesaj,
           (select string_agg(nc.nume, ', ') from nume_client nc where nc.id = any (ss.clienti_vizati)) as pentru,
           ss.clienti_vizati,
           (ss.data_planificata + time '12:00') at time zone 'Europe/Bucharest' as planificat,
           (ss.data_trimitere + time '12:00') at time zone 'Europe/Bucharest' as trimis_la,
           null::text as eroare,
           ss.created as moment
    from situatie_sms_uri ss

    union all
    select 'lead', s.id, s.tip,
           case s.status when 'sent' then 'Trimis' when 'failed' then 'Esuat' else s.status end,
           s.telefon, s.mesaj, nl.nume, null, null, s.trimis_la, s.error, s.trimis_la
    from sms_logs s
    left join nume_lead nl on nl.id = s.lead_id

    union all
    select 'lead', q.id, 'confirmare',
           case q.status when 'programat' then 'De trimis' when 'esuat' then 'Esuat' else 'Anulat' end,
           l.telefon, null, nl.nume, null, q.send_after, null, q.error, q.send_after
    from confirmari_programare_sms q
    left join leads l on l.id = q.lead_id
    left join nume_lead nl on nl.id = q.lead_id
    where q.status in ('programat', 'esuat', 'anulat')

    union all
    select 'lead', q.id, 'review',
           case q.status when 'programat' then 'De trimis' when 'esuat' then 'Esuat' else 'Anulat' end,
           l.telefon, null, nl.nume, null, q.send_after, null, q.error, q.send_after
    from confirmari_review_sms q
    left join leads l on l.id = q.lead_id
    left join nume_lead nl on nl.id = q.lead_id
    where q.status in ('programat', 'esuat', 'anulat')

    union all
    select 'amanat', a.id, a.tip,
           case a.status when 'in_asteptare' then 'Amanat' when 'trimis' then 'Trimis' else 'Esuat' end,
           a.telefon, a.mesaj, nl.nume, null, a.send_after, a.trimis_la, a.error,
           coalesce(a.trimis_la, a.send_after)
    from sms_amanate a
    left join nume_lead nl on nl.id = a.lead_id
    where a.sursa_id is null
      -- trimis cu lead + tip = logat deja în sms_logs de process-sms-amanate; preînscrierile
      -- fără lead se loghează și ele acolo, deci le prindem pe text
      and not (a.status = 'trimis' and (
            (a.lead_id is not null and a.tip is not null)
         or exists (select 1 from sms_logs s where s.telefon = a.telefon and s.mesaj = a.mesaj)))

    union all
    select 'inrolare', ci.id, 'confirmare_inrolare',
           case ci.status when 'programat' then 'De trimis' when 'trimis' then 'Trimis'
                          when 'esuat' then 'Esuat' else 'Anulat' end,
           ci.telefon, ci.mesaj, nc.nume, array[e.client], ci.send_after, ci.trimis_la, ci.error,
           coalesce(ci.trimis_la, ci.send_after)
    from confirmari_inrolare_sms ci
    left join enrollments e on e.id = ci.enrollment_id
    left join nume_client nc on nc.id = e.client

    union all
    -- Textul nu se păstrează (un SMS pe telefon, pentru mai mulți copii); arătăm cursul și data.
    select 'prima_sedinta', r.id, r.tip,
           case r.status when 'trimis' then 'Trimis' else 'Esuat' end,
           null, concat_ws(' · ', cu.numele, to_char(r.data_sedinta, 'DD.MM.YYYY')),
           nc.nume, array[r.client_id], null, r.creat, r.error, r.creat
    from remindere_prima_sedinta r
    left join cursuri cu on cu.id = r.curs_id
    left join nume_client nc on nc.id = r.client_id
  )
  select t.sursa, t.id, t.tip, t.status, t.telefon, t.mesaj, t.pentru, t.clienti_vizati,
         t.planificat, t.trimis_la, t.eroare, count(*) over ()
  from toate t
  where (p_tip is null or t.tip = p_tip)
    and (p_status is null or t.status = p_status)
  order by t.moment desc nulls last, t.id
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function get_jurnal_sms(text, text, int, int) from anon, public;
grant execute on function get_jurnal_sms(text, text, int, int) to authenticated;
