-- Acord la singular în mesajele gărzilor de ștergere („are 1 cursuri" → „are un curs").
-- Logica e neschimbată față de 20261003193000.

create or replace function public._sezon_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cursuri int;
  v_enr     int;
  v_inc     int;
  v_dat     int;
  v_eval    int;
  v_reins   int;
  v_parti   text[] := '{}';
begin
  select count(*) into v_cursuri from cursuri where sezon = old.id;
  select count(*) into v_enr from enrollments where sezon_id = old.id;
  select count(*) into v_inc from incasari where sezon = old.id;
  select count(*) into v_dat from datorii where sezon = old.id;
  select count(*) into v_eval from evaluari where sezon_id = old.id;
  select count(*) into v_reins from reinscrieri_semnate where sezon_id = old.id;

  if v_enr + v_inc + v_dat + v_eval + v_reins = 0 then
    if v_cursuri = 0 then
      return old;
    end if;
    raise exception 'Sezonul are %. Dacă l-ai creat din greșeală, șterge întâi cursurile lui, apoi sezonul.',
      case when v_cursuri = 1 then 'un curs' else format('%s cursuri', v_cursuri) end;
  end if;

  if v_cursuri > 0 then v_parti := v_parti || case when v_cursuri = 1 then 'un curs' else format('%s cursuri', v_cursuri) end; end if;
  if v_enr > 0 then v_parti := v_parti || case when v_enr = 1 then 'o înrolare' else format('%s înrolări', v_enr) end; end if;
  if v_inc > 0 then v_parti := v_parti || case when v_inc = 1 then 'o încasare' else format('%s încasări', v_inc) end; end if;
  if v_dat > 0 then v_parti := v_parti || case when v_dat = 1 then 'o datorie' else format('%s datorii', v_dat) end; end if;
  if v_eval > 0 then v_parti := v_parti || case when v_eval = 1 then 'o evaluare' else format('%s evaluări', v_eval) end; end if;
  if v_reins > 0 then v_parti := v_parti || case when v_reins = 1 then 'o reînscriere semnată' else format('%s reînscrieri semnate', v_reins) end; end if;

  raise exception 'Sezonul nu se poate șterge: are %. Un sezon încheiat se arhivează singur când activezi sezonul următor.',
    array_to_string(v_parti, ', ');
end;
$$;

create or replace function public._eveniment_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part  int;
  v_bani  int;
  v_progr int;
  v_alte  int;
  v_parti text[] := '{}';
begin
  select count(*) into v_part from evenimente_participanti where eveniment = old.id;
  select (select count(*) from bilete where eveniment = old.id)
       + (select count(*) from incasari where bilet = old.id)
       + (select count(*) from datorii where bilet = old.id)
       + (select count(*) from netopia_orders where eveniment_id = old.id)
    into v_bani;
  select count(*) into v_progr from programari_leads where eveniment_programat = old.id;
  select (select count(*) from spectacole where eveniment = old.id)
       + (select count(*) from feedback where eveniment = old.id)
    into v_alte;

  if v_part + v_bani + v_progr + v_alte = 0 then
    return old;
  end if;

  if v_part > 0 then v_parti := v_parti || case when v_part = 1 then 'un participant' else format('%s participanți', v_part) end; end if;
  if v_bani > 0 then v_parti := v_parti || 'bilete sau plăți'; end if;
  if v_progr > 0 then v_parti := v_parti || case when v_progr = 1 then 'un lead programat' else format('%s leaduri programate', v_progr) end; end if;
  if v_alte > 0 then v_parti := v_parti || 'spectacol sau review-uri legate'; end if;

  if v_bani + v_progr + v_alte = 0 then
    raise exception 'Evenimentul are %. Pune-i statusul „Anulat", sau, dacă l-ai creat din greșeală, scoate întâi participanții din roster.',
      case when v_part = 1 then 'un participant' else format('%s participanți', v_part) end;
  end if;

  raise exception 'Evenimentul nu se poate șterge: are %. Pune-i statusul „Anulat" în loc.',
    array_to_string(v_parti, ', ');
end;
$$;

