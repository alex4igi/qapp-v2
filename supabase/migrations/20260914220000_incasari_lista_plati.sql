-- Pagina „Plăți" = registrul încasărilor (un rând = o plată), care înlocuiește și
-- vechea listă de înrolări din /plati, și tabul „Încasări" din /financiar.
--
-- `incasari_lista` aplatizează ce afișa fiecare pagină din embed-uri separate
-- (client, curs + luna, articol, închiriere, eveniment, locație), ca aceeași căutare
-- pe cuvinte să prindă clientul, cursul, detaliile și observațiile dintr-un singur
-- query. security_invoker: vederea citește cu drepturile apelantului, deci gărzile
-- RLS de pe `incasari` (marketing, părinte) rămân în vigoare.

create or replace view incasari_lista
with (security_invoker = true) as
select
  i.id,
  i.data,
  i.created,
  i.suma,
  i.metoda,
  i.categorie,
  i.observatii,
  i.bucati,
  i.locatie,
  l.nume as locatie_nume,
  i.client,
  nullif(btrim(concat_ws(' ', c.nume, c.prenume)), '') as client_nume,
  i.inregistrare,
  e.cursul as curs_id,
  cu.numele as curs_nume,
  e.data_incepere as luna,
  e.tip_plata,
  case
    when i.categorie = 'Abonament' then cu.numele
    when i.categorie = 'Merch' then inv.articol
    -- Din rândul de închiriere, nu din observații: descrierea de la încasare nu
    -- urmărește mutările ulterioare de sală/interval.
    when i.categorie = 'Inchiriere' then nullif(concat_ws(' · ',
      sa.nume,
      nullif(btrim(concat_ws(' ',
        to_char(ch.data, 'DD.MM.YYYY'),
        nullif(concat_ws('–', to_char(ch.ora_start, 'HH24:MI'), to_char(ch.ora_final, 'HH24:MI')), '')
      )), ''),
      coalesce(
        nullif(btrim(concat_ws(' ', t.nume, t.prenume)), ''),
        nullif(btrim(concat_ws(' ', cc.nume, cc.prenume)), ''),
        ch.guest_nume
      )
    ), '')
    when i.bilet is not null then ev.nume_eveniment
    when i.datorie is not null then d.descriere
  end as detalii,
  i.voucher,
  i.datorie,
  i.bilet,
  i.inchiriere
from incasari i
left join locatii l on l.id = i.locatie
left join clienti c on c.id = i.client
left join enrollments e on e.id = i.inregistrare
left join cursuri cu on cu.id = e.cursul
left join inventar inv on inv.id = i.articol_inventar
left join inchirieri ch on ch.id = i.inchiriere
left join sali sa on sa.id = ch.sala
left join teacheri t on t.id = ch.teacher
left join clienti cc on cc.id = ch.client
left join evenimente ev on ev.id = i.bilet
left join datorii d on d.id = i.datorie;

revoke all on incasari_lista from anon, public;
grant select on incasari_lista to authenticated;

-- Totalurile pe TOT filtrul (nu pe pagina de 25). Căutarea reproduce exact
-- applyWordSearch din src/lib/search.ts: fiecare cuvânt (fără , ( ) ) trebuie să
-- apară în cel puțin unul dintre câmpuri — altfel totalul n-ar corespunde listei.
-- Câmpurile se lipesc cu rând nou: un cuvânt n-are spații, deci nu poate prinde
-- două câmpuri deodată, iar `ilike all` evaluează detaliile o dată pe rând.
--
-- plpgsql + force_custom_plan, nu `language sql`: o funcție SQL se planifică fără
-- valorile parametrilor, iar `(p_from is null or …)` ducea la un plan cu nested
-- loop pe toată vederea (3,8 s pe o căutare în toată istoria, aproape de timeout-ul
-- de 8 s). Cu planul pe valori, filtrele goale dispar și join-urile nefolosite se taie.
create or replace function sumar_incasari(
  p_search    text default null,
  p_from      date default null,
  p_to        date default null,
  p_locatie   uuid default null,
  p_categorie text default null,
  p_metoda    text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_tipare text[];
  v_rez    jsonb;
begin
  select coalesce(array_agg('%' || w || '%'), '{}'::text[])
    into v_tipare
  from unnest(regexp_split_to_array(translate(btrim(coalesce(p_search, '')), ',()', ''), '\s+')) as w
  where w <> '';

  with f as (
    select v.suma, v.metoda
    from incasari_lista v
    where (p_from is null or v.data >= p_from)
      and (p_to is null or v.data <= p_to)
      and (p_locatie is null or v.locatie = p_locatie)
      and (p_categorie is null or v.categorie::text = p_categorie)
      and (p_metoda is null or v.metoda::text = p_metoda)
      and (
        cardinality(v_tipare) = 0
        or concat_ws(E'\n', v.client_nume, v.curs_nume, v.detalii, v.observatii) ilike all (v_tipare)
      )
  )
  select jsonb_build_object(
    'numar', (select count(*) from f),
    'total', (select coalesce(sum(suma), 0) from f),
    'pe_metoda', (
      select coalesce(jsonb_object_agg(coalesce(metoda::text, 'Nespecificat'), s), '{}'::jsonb)
      from (select metoda, sum(suma) as s from f group by metoda) x
    )
  )
  into v_rez;

  return v_rez;
end;
$$;

revoke execute on function sumar_incasari(text, date, date, uuid, text, text) from anon, public;
grant execute on function sumar_incasari(text, date, date, uuid, text, text) to authenticated;
