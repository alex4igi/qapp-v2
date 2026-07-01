-- Gard la sursă pe formatul orei cursurilor.
-- Context: o oră stocată ca "19" (fără minute) făcea cursul invizibil în
-- calendarul de închirieri (timeToMinutes cerea strict HH:MM) și genera
-- conflicte fantomă. Impunem HH:MM atât pe `ora`, cât și pe valorile din
-- `ore_pe_zi` (orar diferit pe zile). NULL rămâne permis (curs fără oră unică).

alter table public.cursuri
  add constraint cursuri_ora_format
  check (ora is null or ora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Validează că fiecare valoare din map-ul jsonb `ore_pe_zi` e HH:MM.
-- (CHECK nu acceptă subqueries → o funcție immutable.)
create or replace function public.ore_pe_zi_valid(m jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when m is null then true
    else coalesce(
      (select bool_and(value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
         from jsonb_each_text(m)),
      true)
  end
$$;

alter table public.cursuri
  add constraint cursuri_ore_pe_zi_format
  check (public.ore_pe_zi_valid(ore_pe_zi));
