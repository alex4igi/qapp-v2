-- Absenți de 21 de zile: procedura pe stări (Alex, 08.10.2026).
--
-- 1. Cine a reziliat nu mai intră în listă. Detecția verifica doar că era înscris la
--    ultima prezență, nu și ce s-a întâmplat după: Amelie Averchi, reziliată pe 29.09
--    („Nu mai dorește copilul"), a intrat pe 06.10. La 08.10 erau 9 din 43 de cazuri așa,
--    toate cu motivul scris deja de recepție. O reziliere făcută în afara contactului
--    (din fișa clientului, nu din caz) scoate cazul din K3.
-- 2. „Nu răspunde": apelul fără răspuns se notează, cazul revine peste 7 zile. La al
--    doilea apel fără răspuns pleacă un SMS (cron-afternoon, 16:00) — a treia încercare.
-- 3. Fără răspuns și tot fără prezență la 45 de zile de la ultima → rezilierea lunilor
--    neconsumate o confirmă managerul (notificare + email zilnic până decide). Lunile
--    cu prezențe rămân cu datoria lor. Nurture vine apoi prin jobul EXclient.
-- 4. Ceasul de 48 h nu numără sâmbăta și duminica: în weekend nu se sună.
-- 5. „Amână" cere data de revenire; locul se eliberează (rezilierea din caz), iar la
--    data aleasă cazul reapare în lista de sunat.

-- ── 1. Coloane ──────────────────────────────────────────────────────────────
alter table absente_21z
  add column if not exists stare text not null default 'de_contactat',
  add column if not exists incercari int not null default 0,      -- apeluri fără răspuns
  add column if not exists urmatoarea_incercare date,              -- reapare în lista de sunat
  add column if not exists sms_fara_raspuns_la timestamptz,
  add column if not exists sms_fara_raspuns_eroare text,
  add column if not exists exclus_k3 boolean not null default false,
  add column if not exists reziliere_propusa_la timestamptz,
  add column if not exists reziliere_decisa_la timestamptz,
  add column if not exists reziliere_decisa_de uuid references auth.users(id) on delete set null,
  add column if not exists reziliere_nota text;

alter table absente_21z drop constraint if exists absente_21z_stare_check;
alter table absente_21z add constraint absente_21z_stare_check check (stare in (
  'de_contactat',     -- intrat azi, primul apel în 48 h lucrătoare
  'reincercare',      -- un apel fără răspuns; reapare la `urmatoarea_incercare`
  'fara_raspuns',     -- două apeluri fără răspuns; SMS-ul e a treia încercare
  'de_confirmat',     -- 45 de zile fără prezență: managerul decide rezilierea
  'revine',           -- a răspuns, spune că revine
  'amanat',           -- a răspuns, revine la o dată; locul s-a eliberat
  'renunta',          -- a răspuns, renunță (reziliat din caz)
  'a_revenit',        -- a venit din nou la curs
  'reziliat',         -- managerul a confirmat rezilierea după „fără răspuns"
  'pastrat',          -- managerul a hotărât să nu rezilieze
  'reziliat_separat'  -- reziliat din afara cazului: iese din K3
));

create index if not exists absente_21z_stare_idx on absente_21z (stare, urmatoarea_incercare);

-- ── 2. Ore lucrătoare ───────────────────────────────────────────────────────
-- Ceasul de 48 h folosește `ore_lucratoare(start, end)` (din scorecard, 20260610100200):
-- orele dintre două momente fără sâmbăta și duminica. Un caz intrat sâmbătă are ceasul
-- pornit luni.

-- ── 3. „A reziliat după ultima prezență" ────────────────────────────────────
-- Există o reziliere (cu dată) înainte de `p_pana_la` care atinge perioada de după
-- ancoră, și nicio înrolare nouă creată după ea. A doua condiție lasă în listă pe cine
-- s-a reînscris, a fost mutat sau convertit (abonament ↔ ședințe): acolo rezilierea
-- vine la pachet cu rânduri noi. Lunile închise normal n-au `data_reziliere`, deci nu
-- contează aici (vezi docs/reguli-domeniu.md, „reziliat").
create or replace function absenta_reziliata(p_client uuid, p_curs uuid, p_ancora date, p_pana_la date)
returns boolean
language sql
stable
set search_path = public
as $$
  with rez as (
    select max(r.data_reziliere) as la
    from enrollments r
    where r.client = p_client
      and r.cursul = p_curs
      and r.data_reziliere is not null
      and (r.data_reziliere at time zone 'Europe/Bucharest')::date < p_pana_la
      and coalesce(r.data_final, r.data_incepere) >= p_ancora
  )
  select rez.la is not null
         and not exists (
           select 1 from enrollments e
           where e.client = p_client
             and e.cursul = p_curs
             and e.data_reziliere is null
             and e.created > rez.la)
  from rez;
$$;

revoke execute on function absenta_reziliata(uuid, uuid, date, date) from anon, public;
grant execute on function absenta_reziliata(uuid, uuid, date, date) to authenticated, service_role;

-- Lunile pe care managerul le reziliază la „fără răspuns": fără nicio prezență și fără
-- nicio încasare pe rând. Cu prezențe → rămâne datoria (Alex). Cu bani încasați → nu
-- atingem suma; o eventuală restituire trece prin /plati.
create or replace function absenta_inrolari_de_reziliat(p_client uuid, p_curs uuid)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select e.id
  from enrollments e
  join cursuri c on c.id = e.cursul
  where e.client = p_client
    and e.cursul = p_curs
    and e.reziliat = false
    and e.data_reziliere is null
    and c.nivelul is distinct from 'Trupa'   -- trupele nu se reziliază din aplicație
    and not exists (select 1 from prezente p where p.enrollment = e.id and p.status = 'Prezent')
    and not exists (select 1 from incasari i where i.inregistrare = e.id);
$$;

revoke execute on function absenta_inrolari_de_reziliat(uuid, uuid) from anon, public;
grant execute on function absenta_inrolari_de_reziliat(uuid, uuid) to authenticated, service_role;

-- ── 4. Detecția: fără cei care au reziliat înainte de deschiderea cazului ───
create or replace function detecteaza_absente_21z_interval(
  p_de_la        date,
  p_pana_la      date,
  p_zile         int default 21,
  p_min_sedinte  int default 2
)
returns table (
  client            uuid,
  curs              uuid,
  locatie           uuid,
  data_intrare      date,
  ultima_prezenta   date,
  zile_tacere       int,
  sedinte_fereastra int
)
language sql
stable
security definer
set search_path = public
as $$
  with param as (
    select greatest(coalesce(p_zile, 21), 1) as zile,
           coalesce(p_min_sedinte, 0) as min_sedinte   -- 0 = filtrul e dezactivat
  ),
  prez as (
    select e.client, e.cursul as curs_id, p.data
    from prezente p
    join enrollments e on e.id = p.enrollment
    join cursuri c on c.id = e.cursul
    where p.status = 'Prezent'
      and p.data is not null
      and p.data <= p_pana_la
      and coalesce(c.facultativ, false) = false
    group by e.client, e.cursul, p.data
  ),
  start_inrolare as (
    select e.client, e.cursul as curs_id, min(e.data_incepere) as data
    from enrollments e
    join cursuri c on c.id = e.cursul
    where e.client is not null
      and e.data_incepere is not null
      and e.data_incepere <= p_pana_la
      and coalesce(c.facultativ, false) = false
    group by e.client, e.cursul
  ),
  ancore as (
    select client, curs_id, data, true as e_prezenta from prez
    union all
    select s.client, s.curs_id, s.data, false
    from start_inrolare s
    where not exists (
      select 1 from prez p where p.client = s.client and p.curs_id = s.curs_id and p.data <= s.data
    )
  ),
  episoade as (
    select a.client, a.curs_id, a.data as ancora, a.e_prezenta,
           lead(a.data) over (partition by a.client, a.curs_id order by a.data) as urmatoarea
    from ancore a
  ),
  atingeri as (
    select e.client, e.curs_id,
           (e.ancora + (select zile from param))::date as data_intrare,
           case when e.e_prezenta then e.ancora end as ultima_prezenta,
           e.ancora as de_la
    from episoade e
    where (e.urmatoarea is null or e.urmatoarea > e.ancora + (select zile from param))
      and (e.ancora + (select zile from param))::date between p_de_la and p_pana_la
  ),
  -- Înrolarea care acoperea ANCORA (ultima prezență / începutul înrolării).
  -- Filtrul de reziliere se aplică doar rândurilor încă în vigoare: pe o lună
  -- deja încheiată rezilierea a venit ulterior și nu spune nimic despre atunci
  -- (din 233 de rânduri reziliate ale lui oct. 2025, 191 n-au nici măcar
  -- `data_reziliere` completată).
  cu_inrolare as (
    select a.*, i.locatie_id
    from atingeri a
    join lateral (
      select coalesce(c.locatie, s.locatie) as locatie_id
      from enrollments e
      join cursuri c on c.id = e.cursul
      left join sali s on s.id = c.sala
      where e.client = a.client
        and e.cursul = a.curs_id
        and e.data_incepere <= a.de_la
        and (e.data_final is null or e.data_final >= a.de_la)
        and (e.reziliat = false or e.data_final < current_date)
      order by e.data_incepere desc
      limit 1
    ) i on true
  )
  select ci.client, ci.curs_id, ci.locatie_id, ci.data_intrare, ci.ultima_prezenta,
         (select zile from param)::int,
         sed.nr
  from cu_inrolare ci
  join lateral (
    select count(*)::int as nr
    from (
      select p2.data
      from prezente p2
      join enrollments e2 on e2.id = p2.enrollment
      where e2.cursul = ci.curs_id
        and p2.data > ci.de_la
        and p2.data <= ci.data_intrare
      group by p2.data
    ) z
  ) sed on true
  where sed.nr >= (select min_sedinte from param)
    -- Rezilierea anunțată înseamnă că s-a vorbit deja cu familia, iar motivul e scris
    -- la reziliere (Alex, 08.10.2026).
    and not absenta_reziliata(ci.client, ci.curs_id, ci.de_la, ci.data_intrare);
$$;

revoke execute on function detecteaza_absente_21z_interval(date, date, int, int) from anon, public;
grant execute on function detecteaza_absente_21z_interval(date, date, int, int) to authenticated;

-- ── 5. Curățenia cazurilor existente ────────────────────────────────────────
-- Stările cazurilor deja contactate, din rezultatul contactului.
update absente_21z a
   set stare = case cc.rezultat
                 when 'reusit' then 'revine'
                 when 'follow_up' then 'amanat'
                 when 'pierdut' then 'renunta'
                 else a.stare end
  from client_contacte cc
 where cc.id = a.contact_id
   and a.stare = 'de_contactat';

-- Cazurile care n-ar fi trebuit deschise (9 la 08.10.2026, acord Alex).
delete from absente_21z a
 where a.contactat_la is null
   and absenta_reziliata(a.client, a.curs, a.data_intrare - a.zile_tacere, a.data_intrare);

-- Reziliați după deschidere, fără contact: ies din K3.
update absente_21z a
   set stare = 'reziliat_separat', exclus_k3 = true, updated = now()
 where a.stare in ('de_contactat', 'reincercare', 'fara_raspuns', 'de_confirmat', 'revine')
   and a.evaluat_la is null
   and absenta_reziliata(a.client, a.curs, a.data_intrare - a.zile_tacere, current_date + 1);

-- ── 6. Notificările managerilor ─────────────────────────────────────────────
-- Owner și admin văd toate locațiile; managerul doar locația lui, când o are setată.
create or replace function absenta_notifica_reziliere(p_absenta_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  insert into notifications (recipient_user_id, kind, title, body, payload, requires_action, status)
  select u.id,
         'absenta_reziliere_de_confirmat',
         format('Reziliere de confirmat: %s', trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume))),
         format('%s%s · fără prezență din %s, trei încercări de contact fără răspuns. '
                'Confirmă rezilierea lunilor neconsumate sau păstrează locul.',
                cu.numele,
                coalesce(' · ' || lo.nume, ''),
                to_char(coalesce(a.ultima_prezenta, a.data_intrare - a.zile_tacere), 'DD.MM.YYYY')),
         jsonb_build_object('absenta_id', a.id, 'client_id', a.client, 'curs_id', a.curs,
                            'locatie_id', a.locatie),
         true,
         'open'
  from absente_21z a
  join clienti cl on cl.id = a.client
  join cursuri cu on cu.id = a.curs
  left join locatii lo on lo.id = a.locatie
  join auth.users u
    on u.raw_app_meta_data->>'role' in ('owner', 'admin', 'manager')
   and (u.raw_app_meta_data->>'role' <> 'manager'
        or coalesce(u.raw_app_meta_data->>'locatie_id', '') in ('', a.locatie::text))
  where a.id = p_absenta_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function absenta_notifica_reziliere(uuid) from anon, public, authenticated;
grant execute on function absenta_notifica_reziliere(uuid) to service_role;

create or replace function absenta_inchide_notificari(p_absenta_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update notifications
     set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
   where kind = 'absenta_reziliere_de_confirmat'
     and status = 'open'
     and payload->>'absenta_id' = p_absenta_id::text;
$$;

revoke execute on function absenta_inchide_notificari(uuid) from anon, public, authenticated;
grant execute on function absenta_inchide_notificari(uuid) to service_role;

-- ── 7. Jobul zilnic ─────────────────────────────────────────────────────────
create or replace function job_absente_21z(
  p_ref_date     date default current_date,
  p_dedup_zile   int  default 60,
  p_fereastra    int  default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noi        int := 0;
  v_evaluate   int := 0;
  v_revenit    int := 0;
  v_separat    int := 0;
  v_confirmare int := 0;
  v_id         uuid;
begin
  -- Gard: cronul rulează fără `auth.uid()`; un om trebuie să fie admin.
  if auth.uid() is not null and not is_admin() then
    raise exception 'Doar adminii pot porni manual această rulare automată.' using errcode = '42501';
  end if;

  -- 5a. Cazuri noi. Dedup PE CLIENT (nu pe client×curs): un copil înscris la
  -- două grupe n-are nevoie de două telefoane în aceeași săptămână.
  with candidati as (
    select * from detecteaza_absente_21z(p_ref_date)
  ),
  de_inserat as (
    select distinct on (c.client) c.*
    from candidati c
    where not exists (
      select 1 from absente_21z a
      where a.client = c.client
        and a.data_intrare > p_ref_date - greatest(p_dedup_zile, 1)
    )
    order by c.client, c.zile_tacere desc
  )
  insert into absente_21z
    (client, curs, locatie, data_intrare, ultima_prezenta, zile_tacere, sedinte_fereastra)
  select client, curs, locatie, p_ref_date, ultima_prezenta, zile_tacere, sedinte_fereastra
  from de_inserat;

  get diagnostics v_noi = row_count;

  -- 5b. Închiderea ferestrei de reactivare.
  --
  -- „Reactivat" = are o prezență nouă 'Prezent' în ≤30 de zile de la intrare ȘI,
  -- la data acelei prezențe, înrolarea LUNII RESPECTIVE nu are restanță
  -- EXIGIBILĂ. Exigibilă, nu neplătită: dacă revine pe 3 ale lunii iar scadența
  -- e ziua 15, abonamentul încă nu e scadent — altfel am penaliza exact
  -- revenirea rapidă, care e cea mai valoroasă. Restanța VECHE nu intră aici
  -- (se bonifică separat, prin KPI-ul de restanțe recuperate): un copil nu se
  -- blochează pentru o datorie de acum opt luni.
  with deschise as (
    select a.id, a.client, a.data_intrare
    from absente_21z a
    where a.evaluat_la is null
      and a.data_intrare <= p_ref_date - greatest(p_fereastra, 1)
  ),
  revenire as (
    select d.id, d.client,
           (select min(p.data)
              from prezente p
             where p.client = d.client
               and p.status = 'Prezent'
               and p.data >  d.data_intrare
               and p.data <= d.data_intrare + greatest(p_fereastra, 1)) as prima
    from deschise d
  ),
  verdict as (
    select r.id, r.client, r.prima,
           case when r.prima is null then false
                else not exists (
                  select 1
                  from enrollments e
                  left join lateral (
                    select coalesce(sum(i.suma), 0) as platit
                    from incasari i
                    where i.inregistrare = e.id and i.data <= r.prima
                  ) pl on true
                  where e.client = r.client
                    and e.reziliat = false
                    and e.data_incepere = date_trunc('month', r.prima)::date
                    and scadenta_rata(e.data_incepere, e.sezon_id) < r.prima
                    and coalesce(e.suma, 0) - pl.platit > 0
                )
           end as este_reactivat
    from revenire r
  )
  update absente_21z a
     set reactivat_la = v.prima,
         reactivat    = v.este_reactivat,
         evaluat_la   = now(),
         updated      = now()
    from verdict v
   where a.id = v.id;

  get diagnostics v_evaluate = row_count;

  -- 5c. A venit din nou (la orice grupă, ca în verdictul K3): nu mai e nimic de sunat.
  update absente_21z a
     set stare = 'a_revenit', urmatoarea_incercare = null, updated = now()
   where a.stare in ('de_contactat', 'reincercare', 'amanat', 'fara_raspuns', 'de_confirmat', 'revine')
     and exists (
       select 1 from prezente p
       where p.client = a.client
         and p.status = 'Prezent'
         and p.data > a.data_intrare
         and p.data <= p_ref_date);

  get diagnostics v_revenit = row_count;

  -- 5d. Reziliat din afara cazului (fișa clientului, suspendarea grupei): iese din K3
  -- (Alex, 08.10.2026). Aici, nu într-un trigger: o conversie abonament ↔ ședințe
  -- reziliază rândurile vechi înainte să le scrie pe cele noi, iar regula se uită
  -- tocmai la rândurile noi.
  update absente_21z a
     set stare = 'reziliat_separat', exclus_k3 = true, urmatoarea_incercare = null, updated = now()
   where a.stare in ('de_contactat', 'reincercare', 'fara_raspuns', 'de_confirmat', 'revine')
     and a.evaluat_la is null
     and absenta_reziliata(a.client, a.curs, a.data_intrare - a.zile_tacere, p_ref_date + 1);

  get diagnostics v_separat = row_count;

  -- 5e. Fără răspuns + 45 de zile de la ultima prezență (același prag ca EXclient) →
  -- managerul confirmă rezilierea. Doar după ce a plecat SMS-ul (a treia încercare) și
  -- doar dacă există ce rezilia.
  for v_id in
    update absente_21z a
       set stare = 'de_confirmat', reziliere_propusa_la = now(), updated = now()
     where a.stare = 'fara_raspuns'
       and a.sms_fara_raspuns_la is not null
       and a.data_intrare - a.zile_tacere + 45 <= p_ref_date
       and exists (select 1 from absenta_inrolari_de_reziliat(a.client, a.curs))
    returning a.id
  loop
    perform absenta_notifica_reziliere(v_id);
    v_confirmare := v_confirmare + 1;
  end loop;

  -- Notificările cazurilor ieșite din „de confirmat" pe altă cale (a revenit etc.).
  update notifications n
     set status = 'resolved', resolved_at = now()
   where n.kind = 'absenta_reziliere_de_confirmat'
     and n.status = 'open'
     and not exists (
       select 1 from absente_21z a
       where a.id::text = n.payload->>'absenta_id' and a.stare = 'de_confirmat');

  return jsonb_build_object(
    'data', p_ref_date, 'cazuri_noi', v_noi, 'ferestre_inchise', v_evaluate,
    'au_revenit', v_revenit, 'reziliati_separat', v_separat, 'de_confirmat', v_confirmare
  );
end;
$$;

revoke execute on function job_absente_21z(date, int, int) from anon, public;
grant execute on function job_absente_21z(date, int, int) to authenticated;

-- ── 8. Lista de lucru ───────────────────────────────────────────────────────
drop function if exists get_absente_21z_worklist(uuid[], boolean);

create or replace function get_absente_21z_worklist(
  p_locatii uuid[] default null,
  p_doar_necontactate boolean default false
)
returns table (
  id                     uuid,
  client_id              uuid,
  client_nume            text,
  telefon                text,
  curs_id                uuid,
  curs_nume              text,
  locatie_nume           text,
  data_intrare           date,
  ultima_prezenta        date,
  zile_tacere            int,
  ore_de_la_intrare      numeric,   -- ore lucrătoare (fără weekend) până la primul contact / acum
  contactat_la           timestamptz,
  motiv                  text,
  pas_urmator            text,
  reactivat              boolean,
  reactivat_la           date,
  stare                  text,
  incercari              int,
  urmatoarea_incercare   date,
  de_sunat               boolean,
  sms_fara_raspuns_la    timestamptz,
  sms_fara_raspuns_eroare text,
  exclus_k3              boolean,
  reziliere_propusa_la   timestamptz,
  reziliere_decisa_la    timestamptz,
  reziliere_nota         text,
  luni_de_reziliat       int
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.client,
         trim(format('%s %s', coalesce(cl.prenume, ''), cl.nume)),
         coalesce(cl.telefon, f.telefon), cu.id, cu.numele, lo.nume,
         a.data_intrare, a.ultima_prezenta, a.zile_tacere,
         ore_lucratoare(a.created, coalesce(a.contactat_la, now())),
         a.contactat_la, ma.eticheta, a.pas_urmator,
         a.reactivat, a.reactivat_la,
         a.stare, a.incercari, a.urmatoarea_incercare,
         a.stare = 'de_contactat'
           or (a.stare in ('reincercare', 'amanat')
               and a.urmatoarea_incercare <= (now() at time zone 'Europe/Bucharest')::date),
         a.sms_fara_raspuns_la, a.sms_fara_raspuns_eroare, a.exclus_k3,
         a.reziliere_propusa_la, a.reziliere_decisa_la, a.reziliere_nota,
         case when a.stare = 'de_confirmat'
              then (select count(*)::int from absenta_inrolari_de_reziliat(a.client, a.curs)) end
  from absente_21z a
  join clienti cl on cl.id = a.client
  left join familii f on f.id = cl.familia
  join cursuri cu on cu.id = a.curs
  left join locatii lo on lo.id = a.locatie
  left join motive_abandon ma on ma.id = a.motiv_declarat
  where (p_locatii is null or a.locatie = any(p_locatii))
    and (not p_doar_necontactate or a.contactat_la is null)
  order by a.contactat_la nulls first, a.data_intrare, cl.nume;
$$;

revoke execute on function get_absente_21z_worklist(uuid[], boolean) from anon, public;
grant execute on function get_absente_21z_worklist(uuid[], boolean) to authenticated;

-- ── 9. Contactul ────────────────────────────────────────────────────────────
drop function if exists marcheaza_contact_absenta(uuid, canal_contact, rezultat_contact, uuid, text, text, text);

create or replace function marcheaza_contact_absenta(
  p_absenta_id    uuid,
  p_canal         canal_contact,
  p_rezultat      rezultat_contact,
  p_motiv_id      uuid default null,
  p_motiv_liber   text default null,
  p_pas_urmator   text default null,
  p_observatii    text default null,
  p_data_revenire date default null
)
returns absente_21z
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     absente_21z;
  v_contact uuid;
  v_azi     date := (now() at time zone 'Europe/Bucharest')::date;
  v_stare   text;
  v_urm     date;
begin
  if (select auth_role()) not in ('owner','admin','manager','front_desk') then
    raise exception 'Doar recepția și managerii pot marca contactarea unui absent.' using errcode = '42501';
  end if;

  select * into v_row from absente_21z where id = p_absenta_id for update;
  if not found then
    raise exception 'Cazul nu mai există — reîncarcă pagina.' using errcode = 'P0002';
  end if;
  if v_row.stare not in ('de_contactat', 'reincercare', 'amanat', 'fara_raspuns', 'de_confirmat', 'revine') then
    raise exception 'Cazul e deja închis. Reîncarcă pagina.' using errcode = 'P0001';
  end if;
  if p_rezultat <> 'nu_raspunde' and p_motiv_id is null then
    raise exception 'Alege motivul declarat de familie.' using errcode = '22023';
  end if;
  if p_rezultat = 'follow_up' and (p_data_revenire is null or p_data_revenire <= v_azi) then
    raise exception 'Amânarea cere data la care revine (de mâine încolo).' using errcode = '22023';
  end if;

  -- Al doilea apel fără răspuns → „fără răspuns"; SMS-ul (a treia încercare) pleacă la
  -- 16:00 din cron-afternoon. Pe un caz ajuns deja acolo, un apel în plus nu-l mută înapoi.
  if p_rezultat = 'nu_raspunde' then
    if v_row.stare in ('fara_raspuns', 'de_confirmat') then
      v_stare := v_row.stare;
      v_urm := null;
    elsif v_row.incercari + 1 >= 2 then
      v_stare := 'fara_raspuns';
      v_urm := null;
    else
      v_stare := 'reincercare';
      v_urm := v_azi + 7;
    end if;
  else
    v_stare := case p_rezultat
                 when 'reusit' then 'revine'
                 when 'follow_up' then 'amanat'
                 else 'renunta' end;
    v_urm := case when p_rezultat = 'follow_up' then p_data_revenire end;
  end if;

  insert into client_contacte (client_id, user_id, canal, rezultat, scop, observatii)
  values (v_row.client, auth.uid(), p_canal, p_rezultat, 'reactivare',
          nullif(concat_ws(' · ',
            case when p_rezultat = 'follow_up' then 'Revine pe ' || to_char(p_data_revenire, 'DD.MM.YYYY') end,
            nullif(trim(p_observatii), '')), ''))
  returning id into v_contact;

  update absente_21z
     set contact_id           = v_contact,
         -- prima încercare oprește ceasul de 48 h, chiar fără răspuns (Alex, 08.10.2026)
         contactat_la         = coalesce(contactat_la, now()),
         contactat_de         = coalesce(contactat_de, auth.uid()),
         incercari            = incercari + case when p_rezultat = 'nu_raspunde' then 1 else 0 end,
         stare                = v_stare,
         urmatoarea_incercare = v_urm,
         reziliere_propusa_la = case when v_stare = 'de_confirmat' then reziliere_propusa_la end,
         motiv_declarat       = coalesce(p_motiv_id, motiv_declarat,
                                  case when v_stare = 'fara_raspuns' then
                                    (select m.id from motive_abandon m
                                      where m.eticheta = 'Necunoscut / fără răspuns') end),
         motiv_liber          = coalesce(p_motiv_liber, motiv_liber),
         pas_urmator          = coalesce(p_pas_urmator, pas_urmator),
         updated              = now()
   where id = p_absenta_id
   returning * into v_row;

  if v_stare <> 'de_confirmat' then
    perform absenta_inchide_notificari(p_absenta_id);
  end if;

  return v_row;
end;
$$;

revoke execute on function marcheaza_contact_absenta(uuid, canal_contact, rezultat_contact, uuid, text, text, text, date) from anon, public;
grant execute on function marcheaza_contact_absenta(uuid, canal_contact, rezultat_contact, uuid, text, text, text, date) to authenticated;

-- ── 10. Decizia managerului ─────────────────────────────────────────────────
create or replace function decide_reziliere_absenta(
  p_absenta_id uuid,
  p_reziliaza  boolean,
  p_nota       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row absente_21z;
  v_n   int := 0;
begin
  if (select auth_role()) not in ('owner','admin','manager') then
    raise exception 'Doar managerii confirmă rezilierea unui absent.' using errcode = '42501';
  end if;

  select * into v_row from absente_21z where id = p_absenta_id for update;
  if not found then
    raise exception 'Cazul nu mai există — reîncarcă pagina.' using errcode = 'P0002';
  end if;
  if v_row.stare <> 'de_confirmat' then
    raise exception 'Cazul nu mai așteaptă confirmarea. Reîncarcă pagina.' using errcode = 'P0001';
  end if;
  if exists (select 1 from prezente p
             where p.client = v_row.client and p.status = 'Prezent' and p.data > v_row.data_intrare) then
    raise exception 'A venit din nou la curs între timp — nu mai e nimic de reziliat.' using errcode = 'P0001';
  end if;

  -- Starea se scrie înaintea rezilierii, ca jobul de noapte să n-o ia drept „reziliat separat".
  update absente_21z
     set stare = case when p_reziliaza then 'reziliat' else 'pastrat' end,
         reziliere_decisa_la = now(),
         reziliere_decisa_de = auth.uid(),
         reziliere_nota = nullif(trim(p_nota), ''),
         urmatoarea_incercare = null,
         updated = now()
   where id = p_absenta_id;

  if p_reziliaza then
    update enrollments e
       set reziliat = true, activ = false, suma = 0, suma_baza = 0,
           data_reziliere = now(),
           motiv_reziliere = 'Fără răspuns la 3 încercări de contact (absenți 21 de zile)'
                             || coalesce(' — ' || nullif(trim(p_nota), ''), ''),
           updated = now()
     where e.id in (select absenta_inrolari_de_reziliat(v_row.client, v_row.curs));
    get diagnostics v_n = row_count;
  end if;

  perform absenta_inchide_notificari(p_absenta_id);

  return jsonb_build_object('stare', case when p_reziliaza then 'reziliat' else 'pastrat' end,
                            'inrolari_reziliate', v_n);
end;
$$;

revoke execute on function decide_reziliere_absenta(uuid, boolean, text) from anon, public;
grant execute on function decide_reziliere_absenta(uuid, boolean, text) to authenticated;

-- ── 11. K3: fără cazurile reziliate separat, ceasul fără weekend ────────────
create or replace function public.kpi_k3(p_locatii uuid[], p_anul integer, p_luna integer, p_parametri jsonb default '{}'::jsonb)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with param as (
    select make_date(p_anul, p_luna, 1) as prima_zi,
           (make_date(p_anul, p_luna, 1) + interval '1 month')::date as luna_urm,
           coalesce((p_parametri ->> 'poarta_ore')::numeric, 48) as poarta_ore
  ),
  cazuri as (
    select a.id, a.contactat_la, a.created, a.reactivat, a.evaluat_la,
           case when a.contactat_la is not null
                then ore_lucratoare(a.created, a.contactat_la) end as ore_pana_la_contact
    from absente_21z a, param p
    where a.data_intrare >= p.prima_zi
      and a.data_intrare <  p.luna_urm
      and a.locatie = any(p_locatii)
      and not a.exclus_k3
  )
  select jsonb_build_object(
    'kpi', 'reactivare_21z',
    'numitor',   (select count(*) from cazuri),
    'numarator', (select count(*) from cazuri where reactivat is true),
    'valoare', case when (select count(*) from cazuri) = 0 then null
                    else round((select count(*) from cazuri where reactivat is true)::numeric
                               / (select count(*) from cazuri) * 100, 1) end,
    -- Poarta: TOATE cazurile contactate în termen. Un singur caz necontactat
    -- anulează linia — de asta e „poartă", nu încă un procent.
    'poarta_ok', (select count(*) from cazuri) = 0
                 or not exists (
                   select 1 from cazuri c, param p
                   where c.contactat_la is null
                      or c.ore_pana_la_contact > p.poarta_ore),
    'contactate_la_timp', (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact <= p.poarta_ore),
    'necontactate',       (select count(*) from cazuri where contactat_la is null),
    'contactate_tarziu',  (select count(*) from cazuri c, param p
                            where c.contactat_la is not null
                              and c.ore_pana_la_contact > p.poarta_ore),
    'neevaluate', (select count(*) from cazuri where evaluat_la is null),
    'poarta_ore', (select poarta_ore from param),
    -- Cazurile intră doar în luna lor (cronul le scrie cu data zilei), iar verdictul vine
    -- la 30 de zile: după finalul lunii următoare nu se mai mișcă nimic.
    'provizoriu', (now() at time zone 'Europe/Bucharest')::date < (select luna_urm from param)
                  or exists (select 1 from cazuri where evaluat_la is null),
    'final_la', (((select luna_urm from param) + interval '1 month')::date - 1)::text
  );
$function$;
