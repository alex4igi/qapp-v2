-- Qapp v2 — gardul „o înrolare nu poate începe înaintea sezonului ei".
--
-- Context (2026-09-12, „Ana Aluculesă", N K-Pop SD): abonamentul facultativ pe
-- prima lună a sezonului se salva cu data_incepere = ziua 1 (1 sept), înaintea
-- startului de sezon (12 sept). Fixul din 860eec6 + `20260911120000` a închis
-- calea din UI și RPC-ul de conversie — dar trăia în JS: un tab de recepție
-- deschis înainte de deploy a mai scris un rând pe 1 sept, 11 ore mai târziu.
--
-- Ce face un astfel de rând:
--   * fișa clientului / a familiei / datoriile pe curs / tabul de plăți
--     filtrează `data_incepere` pe intervalul sezonului ⇒ înrolarea e
--     INVIZIBILĂ, dar `get_client_restante` (fără filtru de sezon) o numără
--     ⇒ restanță pe o înrolare care nu se găsește nicăieri;
--   * `are_inrolare_curenta` (cron `auto_mark_inactiv_si_exclient`) cere
--     `data_incepere >= start sezon activ` ⇒ clientul devine EXclient peste
--     noapte, cu opt-out + lead de nurture pe lângă.
--
-- De aceea gardul stă în DB, nu în client: acoperă orice bundle din browser,
-- orice RPC, portalul și importurile. Regula e identică cu
-- `buildFacultativPerLuna`: dacă intervalul înrolării TRAVERSEAZĂ startul
-- sezonului, `data_incepere` se mută pe startul sezonului. Suma nu se atinge
-- (facultativul n-are prorata). Rândurile „Per sedinta" (`data_final` null) și
-- lunile de după start nu sunt atinse.

create or replace function _enrollment_snap_start_sezon()
returns trigger
language plpgsql
as $$
declare
  v_start date;
begin
  if new.data_incepere is null or new.data_final is null then
    return new;
  end if;

  -- sezonul propriu dacă e deja setat (trg_enrollment_derive_sezon rulează
  -- înaintea acestui trigger), altfel cel al cursului.
  select s.data_incepere into v_start
  from sezoane s
  where s.id = coalesce(new.sezon_id, (select c.sezon from cursuri c where c.id = new.cursul));

  if v_start is not null and new.data_incepere < v_start and new.data_final >= v_start then
    new.data_incepere := v_start;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrollment_snap_start_sezon on enrollments;
create trigger trg_enrollment_snap_start_sezon
  before insert or update of data_incepere on enrollments
  for each row execute function _enrollment_snap_start_sezon();

-- ============================================================
-- Raport de gap — pentru `scripts/check-enrollments-sezon.mjs`
-- ============================================================
-- Rândurile rămase cu `data_incepere` în afara sezonului lor: fie dinaintea
-- gardului, fie artefacte de import v1 (ex. an tastat greșit, unde nici snap-ul
-- n-ar ajuta pentru că intervalul nu traversează startul).
-- `security invoker` deliberat: RLS-ul decide cine vede (portalul `parinte` și
-- rolul `marketing` rămân blocate de gărzile de pe tabele).

create or replace function enrollments_sezon_gap_report()
returns table (
  enrollment_id uuid,
  client_nume   text,
  curs_nume     text,
  sezon_nume    text,
  data_incepere date,
  data_final    date,
  sezon_start   date,
  sezon_final   date,
  suma          numeric,
  rest          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id,
    trim(coalesce(cl.prenume, '') || ' ' || coalesce(cl.nume, '')),
    c.numele,
    s.numele_sezonului,
    e.data_incepere,
    e.data_final,
    s.data_incepere,
    s.data_final,
    e.suma,
    coalesce(e.suma, 0)
      - coalesce((select sum(i.suma) from incasari i where i.inregistrare = e.id), 0)
  from enrollments e
  join sezoane s on s.id = e.sezon_id
  left join clienti cl on cl.id = e.client
  left join cursuri c on c.id = e.cursul
  where e.data_incepere is not null
    and (e.data_incepere < s.data_incepere or e.data_incepere > s.data_final)
  order by e.data_incepere;
$$;

revoke execute on function enrollments_sezon_gap_report() from anon, public;
grant execute on function enrollments_sezon_gap_report() to authenticated;
