-- „Nu a venit" nu mai primește un SMS — primește un telefon. (Decizie Alex, 19 sept. 2026)
--
-- Ce era: o singură atingere, un SMS pasiv („da-ne un mesaj la ..."), trimis la
-- 16:00 în prima zi lucrătoare. Procedura scria negru pe alb „nu se sună", iar
-- cardul stătea neatins 10 zile și cădea în Nurture.
--
-- Ce devine: îl sunăm la 2 zile de la absență — iar dacă apelul ar pica în
-- weekend, luni. Dacă nu răspunde, aceeași cadență ca la „Contactat": 3
-- încercări în 5 zile, apoi Nurture. SMS-ul de neprezentare se scoate: un
-- singur canal pentru aceeași absență.
--
-- De ce merită apelul: 27% dintre ședințele demo se termină cu o neprezentare
-- (70 în septembrie), iar 12% dintre cei care n-au venit vreodată au devenit
-- până la urmă clienți — fără ca cineva să-i fi sunat. E singurul status în
-- care omul a arătat interes de două ori: a lăsat datele ȘI a acceptat o dată.

-- ── 1. Ziua apelului ────────────────────────────────────────────────────────
-- Formularea lui Alex — „la două zile, sau luni dacă absența e joi sau vineri" —
-- e exact „+2 zile, iar dacă pică în weekend, luni": joi+2 = sâmbătă, vineri+2 =
-- duminică. Scrisă pe weekend, regula acoperă și absențele de sâmbătă/duminică,
-- zile în care se țin ședințe demo.

create or replace function lead_zi_apel_dupa_neprezentare(p_zi date)
returns date
language sql
immutable
set search_path = public
as $$
  select case extract(isodow from p_zi + 2)
           when 6 then p_zi + 4   -- ar pica sâmbătă → luni
           when 7 then p_zi + 3   -- ar pica duminică → luni
           else p_zi + 2
         end
$$;

comment on function lead_zi_apel_dupa_neprezentare(date) is
  'Ziua în care se sună un lead care n-a venit: +2 zile de la absență, iar dacă pică în weekend, lunea următoare.';

revoke execute on function lead_zi_apel_dupa_neprezentare(date) from anon, public;
grant execute on function lead_zi_apel_dupa_neprezentare(date) to authenticated;

-- ── 2. Ziua apelului se ștampilează central ─────────────────────────────────
-- Aceeași alegere ca la `leads_motiv_categorie` (20260918140000): regula stă
-- într-un trigger, nu în fiecare apelant. Intrarea în „Nu a venit" vine din
-- patru locuri — `prune_expired_leads`, `resolveNoShow` din UI, drag & drop,
-- stepperul din fișă — și toate trebuie să lase aceeași dată în urmă.
--
-- Triggerul face și curățenia inversă: `data_callback_dorit` are înțeles DOAR
-- în „Contactat" (data cerută de om) și în „Nu a venit" (ziua apelului nostru).
-- Rămasă pe un lead programat sau venit la demo, ea îl arată zilnic la
-- „Callback scadent" cu o dată pe care n-a cerut-o nimeni — 28 de leaduri în
-- starea asta la data migrației.

create or replace function trg_lead_ziua_apelului()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zi date;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'nu_a_venit' then
    v_zi := coalesce(
      lead_data_neprezentarii(new.id),
      (new.data_programare at time zone 'Europe/Bucharest')::date,
      (now() at time zone 'Europe/Bucharest')::date
    );
    new.data_callback_dorit := lead_zi_apel_dupa_neprezentare(v_zi);
    -- Cadența celor 3 încercări se numără de la absență. Apelurile prin care
    -- omul a fost programat s-au încheiat cu un „da" — n-au ce căuta în serie.
    new.nr_contactari := 0;
    new.flag_reminder := false;
    new.flag_streak := 0;
    new.flag_reminder_at := null;
    return new;
  end if;

  if new.status not in ('contactat', 'nu_a_venit') then
    new.data_callback_dorit := null;
  end if;
  return new;
end;
$$;

revoke execute on function trg_lead_ziua_apelului() from anon, public;

drop trigger if exists lead_ziua_apelului on leads;
create trigger lead_ziua_apelului
  before insert or update of status on leads
  for each row
  execute function trg_lead_ziua_apelului();

-- ── 3. Cronul de seară: „Nu a venit" capătă steguleț, nu tăcere ─────────────
-- Două schimbări față de 20260918150000:
--
--   • bucket nou `nu_a_venit_de_sunat` → FLAG în ziua apelului. Doar steguleț:
--     dacă nu sună nimeni, cardul rămâne în coloană și stegulețul crește.
--   • `nu_a_venit_10z` cere acum o încercare de apel DUPĂ absență. Regula din
--     17 sept. („omul n-a răspuns ⇒ Nurture; NOI n-am sunat ⇒ doar ⚑") nu se
--     aplica aici, fiindcă pe vremea ei nimeni nu trebuia să sune. Acum trebuie:
--     un lead care pleacă în Nurture nesunat ar ascunde munca nefăcută.
--
-- Plasa celor 3 încercări prinde și „Nu a venit" — aceeași cadență, același prag.

drop function if exists leads_de_flagat_seara();

create or replace function leads_de_flagat_seara()
returns table (
  lead_id          uuid,
  bucket           text,
  actiune          text,   -- 'flag' | 'nurture'
  categorie        text,   -- categoria de scris la nurture
  id_client        uuid,
  flag_reminder    boolean,
  flag_streak      int,
  flag_reminder_at timestamptz,
  referinta        date    -- ziua care a declanșat: termen, scadență, neprezentare
)
language sql
stable
security definer
set search_path = public
as $$
  with azi as (select (now() at time zone 'Europe/Bucharest')::date as zi)
  -- 1. „Nou" cu termenul primului apel depășit. Nu cade niciodată singur:
  --    nimeni nu l-a sunat, deci plecarea lui ar ascunde munca nefăcută.
  select l.id, 'nou_termen_depasit', 'flag', null::text, l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         (lead_termen_primul_apel(l.created) at time zone 'Europe/Bucharest')::date
  from leads l
  where l.status = 'nou' and coalesce(l.deja_client, false) = false
    and lead_termen_primul_apel(l.created) < now()

  union all
  -- 2. „Nu răspunde" cu reîncercarea scadentă. Doar steguleț (drumul 4, scos).
  select l.id, 'nu_raspunde_scadent', 'flag', null::text, l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         coalesce(l.data_callback_dorit::date,
                  (l.ultima_contactare_la at time zone 'Europe/Bucharest')::date)
  from leads l, azi
  where l.status = 'contactat' and l.sub_status = 'nu_raspunde'
    and coalesce(l.deja_client, false) = false
    and case
          when l.data_callback_dorit is not null then l.data_callback_dorit::date <= azi.zi
          -- rânduri dinainte de cadența propusă automat: plasa veche de 2 zile
          else l.ultima_contactare_la < now() - interval '2 days'
        end

  union all
  -- 3. „De revenit" cu data cerută de OM trecută. Tot doar steguleț.
  select l.id, 'de_revenit_scadent', 'flag', null::text, l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         l.data_callback_dorit::date
  from leads l, azi
  where l.status = 'contactat' and l.sub_status = 'de_revenit'
    and coalesce(l.deja_client, false) = false
    and l.data_callback_dorit is not null
    and l.data_callback_dorit::date <= azi.zi

  union all
  -- 4. „Nu a venit" cu ziua apelului sosită → steguleț, ca să urce în
  --    „De lucrat azi". Ieșirea din pipeline nu se atinge aici.
  select l.id, 'nu_a_venit_de_sunat', 'flag', null::text, l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         l.data_callback_dorit::date
  from leads l, azi
  where l.status = 'nu_a_venit'
    and coalesce(l.deja_client, false) = false
    and l.data_callback_dorit is not null
    and l.data_callback_dorit::date <= azi.zi

  union all
  -- 5. „Nu a venit", SUNAT și fără ecou de 10 zile → Nurture. Nesunat, rămâne
  --    în coloană: vina noastră nu scoate omul din pipeline.
  select l.id, 'nu_a_venit_10z', 'nurture', 'nu_a_venit', l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         lead_data_neprezentarii(l.id)
  from leads l, azi
  where l.status = 'nu_a_venit'
    and lead_data_neprezentarii(l.id) is not null
    and lead_data_neprezentarii(l.id) <= azi.zi - 10
    and l.ultima_contactare_la is not null
    and (l.ultima_contactare_la at time zone 'Europe/Bucharest')::date
          > lead_data_neprezentarii(l.id)

  union all
  -- 6. Plasa: trei încercări consecutive fără răspuns. Pragul e cel din
  --    MAX_INCERCARI_FARA_RASPUNS — frontendul mută la a 3-a, aici prindem doar
  --    ce a scăpat (import, editare directă, un flux care n-a trecut prin 📞).
  select l.id, 'plasa_3_incercari', 'nurture',
         case when l.status = 'nu_a_venit' then 'nu_a_venit' else 'nu_a_raspuns' end,
         l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at, null::date
  from leads l
  where l.status in ('nou', 'contactat', 'nu_a_venit')
    and coalesce(l.deja_client, false) = false
    and coalesce(l.nr_contactari, 0) >= 3
$$;

comment on function leads_de_flagat_seara() is
  'Ce are de lucru cronul de seară, cu politica lipită de fiecare bucket (flag vs. nurture). Dry-run: select bucket, actiune, count(*) from leads_de_flagat_seara() group by 1,2;';

revoke execute on function leads_de_flagat_seara() from anon, public;
grant execute on function leads_de_flagat_seara() to authenticated;

-- ── 4. Cardurile care există deja ───────────────────────────────────────────
-- Cei 48 din coloană au primit SMS-ul vechi și n-au primit niciun apel. Ziua
-- apelului se calculează retroactiv din ziua absenței: pentru cele mai vechi de
-- 2 zile iese o dată trecută, adică steguleț la prima rulare de seară — exact
-- intenția, fiindcă sunt oameni pe care nu i-a sunat nimeni.
--
-- Nu atinge `status`, deci nu redeclanșează triggerul de mai sus.

update leads l
   set data_callback_dorit = lead_zi_apel_dupa_neprezentare(lead_data_neprezentarii(l.id)),
       nr_contactari = 0
 where l.status = 'nu_a_venit'
   and lead_data_neprezentarii(l.id) is not null;

-- Ziua de callback rămasă din faza de „Contactat" pe leaduri care au trecut mai
-- departe: le scotea zilnic la „Callback scadent" cu o dată pe care n-a cerut-o
-- nimeni. De acum triggerul o curăță la tranziție; aici se curăță trecutul.
update leads
   set data_callback_dorit = null
 where status not in ('contactat', 'nu_a_venit')
   and data_callback_dorit is not null;
