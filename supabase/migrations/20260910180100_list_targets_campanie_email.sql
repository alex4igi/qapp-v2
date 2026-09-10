-- Bulk send de acte adiționale sărea familiile fără telefon („nu pot primi link"),
-- deși contractul poate pleca pe email. Cu regula de canal unic (SMS dacă are
-- telefon, altfel email) ținta are nevoie și de email ca să decidă gating-ul.
-- Coloana se adaugă la FINALUL tabelului returnat, ca ordinea existentă să nu se mute.
drop function if exists list_targets_campanie(uuid);

create or replace function list_targets_campanie(p_campanie_id uuid)
returns table (
  client_id     uuid,
  client_nume   text,
  familie_id    uuid,
  familie_nume  text,
  telefon       text,
  curs_tinta_id uuid,
  curs_nume     text,
  act_status    text,
  are_contract  boolean,
  email         text
)
language sql
stable
security invoker
set search_path = public
as $$
  with camp as (
    select sezon_tinta from campanii_reinscriere where id = p_campanie_id
  ),
  target as (
    select c.id as curs_id, c.numele, c.cursul_original
    from cursuri c, camp
    where c.sezon = camp.sezon_tinta
      and c.facultativ = false
      and c.cursul_original is not null
  ),
  eligibili as (
    select distinct t.curs_id, e.client
    from target t
    join enrollments e on e.cursul = t.cursul_original
    where e.activ = true
      and e.reziliat = false
      and (e.data_incepere is null or e.data_incepere <= current_date)
      and (e.data_final is null or e.data_final >= current_date)
  )
  select
    c.id,
    (c.nume || ' ' || coalesce(c.prenume, ''))::text,
    f.id,
    f.nume_familie,
    coalesce(f.telefon, c.telefon),
    t.curs_id,
    t.numele,
    coalesce(g.act_status, 'nesemnat'),
    exists (
      select 1 from contracte ct
      where ct.client_id = c.id
        and ct.campanie_id = p_campanie_id
        and ct.status in ('trimis', 'deschis', 'semnat', 'finalizat')
    ),
    coalesce(f.email, c.email)
  from eligibili el
  join target t on t.curs_id = el.curs_id
  join clienti c on c.id = el.client
  left join familii f on f.id = c.familia
  left join reinscrieri_gate g
    on g.client_id = el.client
   and g.curs_tinta_id = el.curs_id
   and g.campanie_id = p_campanie_id
  order by t.numele, c.nume;
$$;

grant execute on function list_targets_campanie(uuid) to authenticated;
revoke execute on function list_targets_campanie(uuid) from anon, public;
