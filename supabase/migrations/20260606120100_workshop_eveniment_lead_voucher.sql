-- Workshop-uri ocazionale — suport pentru:
--   1. Distincția workshop vs eveniment normal (evenimente.tip)
--   2. Legarea încasării de un guest (incasari.lead) când nu e client existent
--   3. Decrement voucher la plăți simple (trigger pe incasari)

-- ============================================================
-- 1. Tip eveniment (Eveniment | Workshop)
-- ============================================================
create type tip_eveniment as enum ('Eveniment', 'Workshop');

alter table evenimente
  add column tip tip_eveniment not null default 'Eveniment';

-- ============================================================
-- 2. Încasarea de workshop se leagă de client SAU lead (guest)
-- ============================================================
alter table incasari
  add column lead uuid references leads(id) on delete set null;

-- ============================================================
-- 3. Decrement numar_utilizari la plăți simple cu voucher.
--    Calea Abonament (registerPlataFifo) NU scrie incasari.voucher
--    (voucherul stă pe enrollment, acoperit de trg_voucher_decrement),
--    deci acest trigger acoperă doar plățile simple (Bilet/Merch/Taxa/Workshop).
-- ============================================================
create or replace function voucher_decrement_on_incasare()
returns trigger
language plpgsql
as $$
begin
  if new.voucher is not null then
    update vouchere
       set numar_utilizari = numar_utilizari - 1
     where id = new.voucher
       and numar_utilizari is not null
       and numar_utilizari > 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_voucher_decrement_incasare on incasari;

create trigger trg_voucher_decrement_incasare
  after insert on incasari
  for each row
  execute function voucher_decrement_on_incasare();
