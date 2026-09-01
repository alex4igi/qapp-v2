-- Qapp v2 — un contact logat curăță steagul de prioritate.
--
-- Bug: `flag_reminder` se ștergea DOAR la schimbarea statusului
-- (transitions.ts:180), iar `logContact` schimbă statusul doar din 'nou' →
-- 'contactat'. Pe un lead deja 'contactat' sau 'a_venit', un apel real nu
-- atingea steagul — cronul îl găsea cu `flag_reminder_at` vechi și îl trimitea
-- direct în nurture, fără ciclu de avertisment. 19 din 47 de mutări din
-- 'contactat' din ultimele 120 de zile erau oameni sunați în ultimele 7 zile.
--
-- Steagul înseamnă „nimeni nu s-a atins de leadul ăsta", deci ORICE contact
-- logat îl stinge, indiferent de rezultat: escaladarea spre nurture rămâne, dar
-- cere tăcere reală, nu doar trecerea timpului. Plasa `nr_contactari >= 4`
-- (încercări consecutive fără răspuns) rămâne neatinsă.
--
-- Se face în trigger, nu în TS: `lead_contacte` are mai mulți scriitori (UI +
-- edge functions) — vezi nota din 20260722100000.

create or replace function bump_lead_ultima_contactare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads
  set ultima_contactare_la = greatest(ultima_contactare_la, new.created),
      flag_reminder    = false,
      flag_reminder_at = null,
      flag_streak      = 0
  where id = new.lead_id
    and (
      ultima_contactare_la is null
      or ultima_contactare_la < new.created
      or flag_reminder
    );
  return null;
end;
$$;

revoke execute on function bump_lead_ultima_contactare() from anon, public;
