-- Ștergerea unui sezon / voucher / eveniment cu istoric NU era blocată: cheile străine
-- sunt pe cascadă sau set null, deci ștergerea trecea și lua istoricul cu ea.
-- Ex. sezonul 2026-2027 (3 oct.): 318 reînscrieri semnate, capacitatea a 57 de grupe și
-- vacanțele s-ar fi șters, iar 6.577 de înrolări și 934 de încasări ar fi rămas fără sezon.
-- Regula (confirmat de Alex, 3 oct.): se șterge doar ce n-a fost folosit; restul se
-- arhivează / dezactivează / anulează. Inventar: docs/inventar-mesaje-eroare.md §4.
--
-- Funcțiile sunt security definer ca să numere TOT, nu doar ce lasă RLS-ul rolului care
-- șterge (un instructor nu vede încasările unui eveniment al grupei lui).

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
    raise exception 'Sezonul are % cursuri. Dacă l-ai creat din greșeală, șterge întâi cursurile lui, apoi sezonul.',
      v_cursuri;
  end if;

  if v_cursuri > 0 then v_parti := v_parti || format('%s cursuri', v_cursuri); end if;
  if v_enr > 0 then v_parti := v_parti || format('%s înrolări', v_enr); end if;
  if v_inc > 0 then v_parti := v_parti || format('%s încasări', v_inc); end if;
  if v_dat > 0 then v_parti := v_parti || format('%s datorii', v_dat); end if;
  if v_eval > 0 then v_parti := v_parti || format('%s evaluări', v_eval); end if;
  if v_reins > 0 then v_parti := v_parti || format('%s reînscrieri semnate', v_reins); end if;

  raise exception 'Sezonul nu se poate șterge: are %. Un sezon încheiat se arhivează singur când activezi sezonul următor.',
    array_to_string(v_parti, ', ');
end;
$$;

create or replace function public._voucher_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  select (select count(*) from voucher_redemptions where voucher = old.id)
       + (select count(*) from enrollments where voucher = old.id)
       + (select count(*) from incasari where voucher = old.id)
       + (select count(*) from datorii where voucher = old.id)
       + (select count(*) from netopia_orders where voucher_id = old.id)
    into v_n;

  if v_n > 0 then
    raise exception 'Voucherul a fost folosit și nu se poate șterge (s-ar pierde istoricul reducerilor). Debifează „Activ" din fișa lui ca să nu mai poată fi aplicat.';
  end if;
  return old;
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

  if v_part > 0 then v_parti := v_parti || format('%s participanți', v_part); end if;
  if v_bani > 0 then v_parti := v_parti || 'bilete sau plăți'; end if;
  if v_progr > 0 then v_parti := v_parti || format('%s leaduri programate', v_progr); end if;
  if v_alte > 0 then v_parti := v_parti || 'spectacol sau review-uri legate'; end if;

  if v_bani + v_progr + v_alte = 0 then
    raise exception 'Evenimentul are % participanți. Pune-i statusul „Anulat", sau, dacă l-ai creat din greșeală, scoate întâi participanții din roster.',
      v_part;
  end if;

  raise exception 'Evenimentul nu se poate șterge: are %. Pune-i statusul „Anulat" în loc.',
    array_to_string(v_parti, ', ');
end;
$$;

revoke execute on function public._sezon_delete_guard() from public, anon, authenticated;
revoke execute on function public._voucher_delete_guard() from public, anon, authenticated;
revoke execute on function public._eveniment_delete_guard() from public, anon, authenticated;

drop trigger if exists trg_sezon_delete_guard on public.sezoane;
create trigger trg_sezon_delete_guard
  before delete on public.sezoane
  for each row execute function public._sezon_delete_guard();

drop trigger if exists trg_voucher_delete_guard on public.vouchere;
create trigger trg_voucher_delete_guard
  before delete on public.vouchere
  for each row execute function public._voucher_delete_guard();

drop trigger if exists trg_eveniment_delete_guard on public.evenimente;
create trigger trg_eveniment_delete_guard
  before delete on public.evenimente
  for each row execute function public._eveniment_delete_guard();
