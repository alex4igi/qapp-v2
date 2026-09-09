-- „Fără poze" — refuz explicit GDPR de apariție în fotografii/filmări.
--
-- De ce o coloană nouă și nu `familii.doreste_sa_apara_in_poze`: aceea e un flag
-- POZITIV cu `default false`, deci absența acordului și refuzul explicit arată la
-- fel. În date: 696 din 702 familii sunt `false` pentru că nimeni n-a completat
-- câmpul, nu pentru că au refuzat. O iconiță pe rosterul grupei bazată pe el ar
-- apărea la toată lumea și n-ar mai însemna nimic.
--
-- `fara_poze` are o singură semnificație: cineva a spus explicit NU. Sursele sunt
-- Anexa 2 din contractul educațional (`refuz_imagine`, semnată) și bifa manuală de
-- pe fișa familiei/clientului. `doreste_sa_apara_in_poze` rămâne neatins (îl scrie
-- portalul membri) — nu-l sincronizăm, pentru că în portal un părinte care salvează
-- formularul fără să atingă bifa trimite `false`, ceea ce NU e un refuz.

alter table familii add column if not exists fara_poze boolean not null default false;
alter table clienti add column if not exists fara_poze boolean not null default false;

comment on column familii.fara_poze is
  'Refuz explicit GDPR: familia nu vrea să apară în poze/filmări. Sursă: Anexa 2 din contract sau bifa de pe fișă. NU e inversul lui doreste_sa_apara_in_poze (acela e default false = necompletat).';
comment on column clienti.fara_poze is
  'Refuz explicit GDPR pe copil (override peste familie). Iconița din rosterul grupei se aprinde dacă e true aici SAU pe familie.';

-- Contractele deja semnate: Anexa 2 e răspunsul legal, îl aducem în flag.
update familii f set fara_poze = true
where fara_poze = false
  and exists (
    select 1 from contracte c
    where c.familie_id = f.id
      and c.status in ('semnat', 'finalizat')
      and lower(coalesce(c.valori->>'refuz_imagine', '')) in ('true', 't', '1', 'x', 'da')
  );

-- La semnarea unui contract nou, flagul se aliniază singur cu Anexa 2 —
-- altfel recepția ar trebui să transcrie manual fiecare contract.
create or replace function sync_fara_poze_din_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refuz boolean;
begin
  if new.status not in ('semnat', 'finalizat') then
    return new;
  end if;

  v_refuz := case
    when lower(coalesce(new.valori->>'refuz_imagine', '')) in ('true', 't', '1', 'x', 'da') then true
    when lower(coalesce(new.valori->>'acord_imagine', '')) in ('true', 't', '1', 'x', 'da') then false
    else null
  end;
  -- Contract fără Anexa 2 completată: nu presupunem nimic.
  if v_refuz is null then
    return new;
  end if;

  update familii set fara_poze = v_refuz
  where id = new.familie_id and fara_poze is distinct from v_refuz;

  if new.client_id is not null then
    update clienti set fara_poze = v_refuz
    where id = new.client_id and fara_poze is distinct from v_refuz;
  end if;

  return new;
end;
$$;

revoke execute on function sync_fara_poze_din_contract() from anon, public;

drop trigger if exists trg_sync_fara_poze on contracte;
create trigger trg_sync_fara_poze
  after insert or update of status, valori on contracte
  for each row execute function sync_fara_poze_din_contract();
