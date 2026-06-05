-- Vouchere — fundație (Etapa 1)
--   1. Unique constraint pe cod_voucher (necesar pentru ON CONFLICT seed)
--   2. Constraint pe interval valabilitate și valoare
--   3. Trigger AFTER INSERT pe enrollments: decrement automat numar_utilizari
--      (doar pentru vouchere cu numar_utilizari NOT NULL)
--   4. Seed 9 vouchere standard din v1 (A10, P10, P50, P100, RE10/20/50, BE10M, TRUPA50)
--
-- Notă: enum-ul tip_voucher păstrează valoarea 'Special' din motive de compat
-- (eliminarea unui enum value în Postgres e disruptivă). 'Special' e scoasă
-- din UI (src/lib/enums.ts).

-- ============================================================
-- 1. UNIQUE pe cod_voucher
-- ============================================================
alter table vouchere
  add constraint vouchere_cod_voucher_unique unique (cod_voucher);

-- ============================================================
-- 2. CHECK constraints
-- ============================================================
alter table vouchere
  add constraint vouchere_valoare_nonneg check (valoare is null or valoare >= 0);

alter table vouchere
  add constraint vouchere_interval_valid
    check (data_inceperii is null or data_expirarii is null or data_inceperii <= data_expirarii);

alter table vouchere
  add constraint vouchere_utilizari_nonneg check (numar_utilizari is null or numar_utilizari >= 0);

-- ============================================================
-- 3. Trigger decrement numar_utilizari la creare enrollment cu voucher
-- ============================================================
create or replace function voucher_decrement_on_enrollment()
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

drop trigger if exists trg_voucher_decrement on enrollments;

create trigger trg_voucher_decrement
  after insert on enrollments
  for each row
  execute function voucher_decrement_on_enrollment();

-- ============================================================
-- 4. Seed vouchere v1 (idempotent)
-- ============================================================
insert into vouchere
  (cod_voucher, descriere, tip, valoare, data_inceperii, data_expirarii, numar_utilizari, tip_enrollment)
values
  ('A10',     'Reducere 10% pentru achitare integrală a sezonului (în prima lună).',                     'Procent', 10,  '2026-09-01', '2026-09-30', null, 'Per an'),
  ('P10',     '10% reducere pentru al doilea curs sau al doilea membru al familiei (manual).',           'Procent', 10,  null, null, null, 'Per luna'),
  ('P50',     'Reducere 50% (excepție).',                                                                 'Procent', 50,  null, null, null, 'Per luna'),
  ('P100',    'Reducere 100% — preț devine 0 RON (excepție).',                                            'Procent', 100, null, null, null, 'Per luna'),
  ('RE10',    'Discount 10 RON pe abonament (orientativ pentru 1×/săpt).',                                'Valoare', 10,  null, null, null, 'Per luna'),
  ('RE20',    'Discount 20 RON pe abonament.',                                                            'Valoare', 20,  null, null, null, 'Per luna'),
  ('RE50',    'Discount 50 RON pe abonament.',                                                            'Valoare', 50,  null, null, null, 'Per luna'),
  ('BE10M',   'Discount 10 RON per ședință (bilet).',                                                     'Valoare', 10,  null, null, null, 'Per sedinta'),
  ('TRUPA50', 'Discount 50% per ședință pentru membrii trupelor.',                                        'Procent', 50,  null, null, null, 'Per sedinta')
on conflict (cod_voucher) do nothing;
