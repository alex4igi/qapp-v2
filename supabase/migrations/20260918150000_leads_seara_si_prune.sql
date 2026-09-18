-- Cronul de seară primește o singură sursă de adevăr, în SQL, iar
-- `prune_expired_leads` învață că bifa instructorului înseamnă „a venit".
--
-- 1. `leads_de_flagat_seara()` — ce are de lucru cronul de seară, cu politica
--    (flag sau Nurture) lipită de fiecare bucket. Motivele:
--      • cele trei praguri erau împrăștiate în TypeScript, fiecare cu propriul
--        `.lt()` pe o coloană diferită, deci nu se putea rula niciun dry-run
--        înainte de a schimba o regulă;
--      • „nu a venit de 10 zile" se număra din `leads.updated` — orice editare
--        a fișei resetează ceasul, deci regula măsura când am atins noi rândul,
--        nu când n-a venit omul;
--      • termenul coloanei „Nou" se compara cu `created + 24h`, deși procedura
--        decisă pe 09-17 spune „în aceeași zi, până la 18:00; seara → a doua zi
--        până la 12:00".
--
-- 2. Drumul 4 spre Nurture se închide (decizie Alex, 09-17): un steguleț ignorat
--    pe `nu_raspunde` sau pe `de_revenit` înseamnă că NOI n-am sunat. Vina
--    noastră nu scoate omul din pipeline — rămâne roșu până îl atinge cineva.
--    Ieșirea automată rămâne pe efort dovedit (3 încercări) și pe purtarea
--    omului (n-a venit).
--
-- 3. Plasa de siguranță scade de la 4 la 3 încercări, ca să coincidă cu
--    `MAX_INCERCARI_FARA_RASPUNS` din frontend (cadența 3-în-5-zile).

-- ── Termenul primului apel, în SQL ──────────────────────────────────────────
-- Oglinda lui `termenPrimulApel()` din src/features/leads/procedura.ts. Ora se
-- citește pe fusul local: un lead intrat la 21:00 ora României e 18:00 UTC, deci
-- pe UTC ar fi ieșit „de sunat azi" într-o zi deja încheiată.

create or replace function lead_termen_primul_apel(p_created timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when extract(hour from (p_created at time zone 'Europe/Bucharest')) >= 18
      then (((p_created at time zone 'Europe/Bucharest')::date + 1) + time '12:00')
             at time zone 'Europe/Bucharest'
    else (((p_created at time zone 'Europe/Bucharest')::date) + time '23:59:59')
             at time zone 'Europe/Bucharest'
  end
$$;

comment on function lead_termen_primul_apel(timestamptz) is
  'Termenul primului apel pentru un lead „Nou": azi până la 23:59, sau mâine 12:00 dacă a intrat după 18:00. Oglinda lui termenPrimulApel() din procedura.ts.';

revoke execute on function lead_termen_primul_apel(timestamptz) from anon, public;
grant execute on function lead_termen_primul_apel(timestamptz) to authenticated;

-- ── Data neprezentării ──────────────────────────────────────────────────────
-- Cele 10 zile se numără de la ZIUA ÎN CARE N-A VENIT, nu de la ultima atingere
-- a rândului. Trei surse, în ordinea încrederii: programarea marcată absent →
-- momentul în care aplicația l-a trecut pe „nu a venit" → data de pe cartonaș.
-- Fără `updated` ca plasă finală: e coloana care a produs bug-ul.

create or replace function lead_data_neprezentarii(p_lead uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select max(pl.data_programarii) from programari_leads pl
      where pl.lead = p_lead and pl.prezenta = 'absent'),
    (select (max(h.created_at) at time zone 'Europe/Bucharest')::date
       from lead_history h
      where h.lead_id = p_lead and h.action_type = 'status_change'
        and h.new_value = 'nu_a_venit'),
    (select (l.data_programare at time zone 'Europe/Bucharest')::date
       from leads l where l.id = p_lead)
  )
$$;

revoke execute on function lead_data_neprezentarii(uuid) from anon, public;
grant execute on function lead_data_neprezentarii(uuid) to authenticated;

-- ── Lista de lucru a cronului de seară ──────────────────────────────────────

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
  -- 4. „Nu a venit" de 10 zile → Nurture. Zece zile de la NEPREZENTARE.
  select l.id, 'nu_a_venit_10z', 'nurture', 'nu_a_venit', l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at,
         lead_data_neprezentarii(l.id)
  from leads l, azi
  where l.status = 'nu_a_venit'
    and lead_data_neprezentarii(l.id) is not null
    and lead_data_neprezentarii(l.id) <= azi.zi - 10

  union all
  -- 5. Plasa: trei încercări consecutive fără răspuns. Pragul e cel din
  --    MAX_INCERCARI_FARA_RASPUNS — frontendul mută la a 3-a, aici prindem doar
  --    ce a scăpat (import, editare directă, un flux care n-a trecut prin 📞).
  select l.id, 'plasa_3_incercari', 'nurture', 'nu_a_raspuns', l.id_client,
         l.flag_reminder, l.flag_streak, l.flag_reminder_at, null::date
  from leads l
  where l.status in ('nou', 'contactat')
    and coalesce(l.deja_client, false) = false
    and coalesce(l.nr_contactari, 0) >= 3
$$;

comment on function leads_de_flagat_seara() is
  'Ce are de lucru cronul de seară, cu politica lipită de fiecare bucket (flag vs. nurture). Dry-run: select bucket, actiune, count(*) from leads_de_flagat_seara() group by 1,2;';

revoke execute on function leads_de_flagat_seara() from anon, public;
grant execute on function leads_de_flagat_seara() to authenticated;

-- ── prune_expired_leads: bifa instructorului mută leadul ────────────────────
-- Capcana găsită la analiză: `marcheaza_prezenta_lead_*` scriu doar în
-- `programari_leads`. Un lead bifat PREZENT de instructor rămânea `programat`,
-- iar noaptea cădea în `nu_a_venit` — adică exact omul care fusese în sală
-- primea a doua zi SMS-ul „ne pare rău că n-ai ajuns". Latent (0 cazuri în 30
-- de zile, verificat pe 18 sept.), dar tăcut și greu de explicat clientului.
--
-- Restul e neschimbat față de 20260909110000, în afară de data: `current_date`
-- e ziua serverului (UTC), iar funcția rulează la 23:30/00:30 ora României —
-- fereastra în care UTC e încă „ieri", deci programările de azi păreau expirate.
--
-- Categoria motivului NU se mai scrie aici: o pune triggerul central
-- `leads_motiv_categorie` (20260918140000), pentru toate cele 13 drumuri.

create or replace function prune_expired_leads()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azi     date := (now() at time zone 'Europe/Bucharest')::date;
  v_absente int := 0;
  v_avenit  int := 0;
  v_nurture int := 0;
  v_navenit int := 0;
begin
  -- 1. Programările trecute se închid ca 'absent' (triggerul recalculează
  --    nr_neprezentari). Doar cele expirate: o programare viitoare a aceluiași
  --    lead rămâne neatinsă. Bifele instructorului ('prezent') nu se ating.
  update programari_leads
     set prezenta = 'absent',
         updated  = now()
   where prezenta = 'programat'
     and data_programarii < v_azi;
  get diagnostics v_absente = row_count;

  -- 2. A FOST în sală, dar cartonașul n-a aflat. Ultima programare consumată e
  --    'prezent' ⇒ leadul e 'a_venit', nu 'nu_a_venit'. Rulează ÎNAINTEA
  --    pașilor de neprezentare, ca să-i scoată din calea lor.
  update leads l
     set status = 'a_venit'
   where l.status = 'programat'
     and not exists (
       select 1 from programari_leads pl
        where pl.lead = l.id and pl.data_programarii >= v_azi
     )
     and (
       select pl.prezenta from programari_leads pl
        where pl.lead = l.id
        order by pl.data_programarii desc, pl.created desc
        limit 1
     ) = 'prezent';
  get diagnostics v_avenit = row_count;

  -- 3a. A 2-a neprezentare → nurture, fără SMS. Excepție: protejații.
  update leads l
     set status = 'nurture',
         sub_status = null,
         flag_reminder = false,
         flag_streak = 0,
         flag_reminder_at = null
   where l.status = 'programat'
     and exists (select 1 from programari_leads pl where pl.lead = l.id)
     and not exists (
       select 1 from programari_leads pl
        where pl.lead = l.id and pl.data_programarii >= v_azi
     )
     and l.nr_neprezentari >= 2
     and not exists (
       select 1 from clienti c
        where c.id = l.id_client and c.status <> 'EXclient'
     );
  get diagnostics v_nurture = row_count;

  -- 3b. Restul (prima neprezentare, sau protejat) → nu_a_venit.
  update leads l
     set status = 'nu_a_venit'
   where l.status = 'programat'
     and exists (select 1 from programari_leads pl where pl.lead = l.id)
     and not exists (
       select 1 from programari_leads pl
        where pl.lead = l.id and pl.data_programarii >= v_azi
     );
  get diagnostics v_navenit = row_count;

  return jsonb_build_object(
    'absente', v_absente,
    'a_venit', v_avenit,
    'nurture', v_nurture,
    'nu_a_venit', v_navenit
  );
end;
$$;

grant  execute on function prune_expired_leads() to authenticated;
revoke execute on function prune_expired_leads() from anon, public;
