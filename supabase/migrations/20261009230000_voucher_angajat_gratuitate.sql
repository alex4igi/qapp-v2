-- Voucher de angajat și gratuitate specială (Alex, 9 oct. 2026).
--
-- Problema: la S Rock On Q managerul a pus pe 0 lei înscrierile celor 6 instructori care vin la
-- trupă pe voucherul de angajat. Numărătoarea de plătitori cere `suma > 0`, deci grupa de 15 a
-- ieșit cu 9–10 plătitori, sub pragul de 14 al trupei ⇒ trainerul plătit ca intermediar.
--
-- Regula:
--   • Voucher de angajat: fiecare angajat (instructor, recepție, staff) are 300 lei pe lună
--     (`voucher_lunar` din grila instructorilor) de folosit la orice grupă Quasar. Rata acoperită
--     nu se plătește, dar omul se NUMĂRĂ ca loc plătit. Ce rămâne din 300 se consumă la a doua
--     grupă din aceeași lună; peste 300, diferența se plătește.
--   • Gratuitate specială: favoare asumată de Alex (ex. propria fiică, cineva care a ajutat
--     firma). Rata e acoperită integral, oricât costă, și omul se NUMĂRĂ ca loc plătit.
--   • Amândouă le pune doar owner/admin, cu motiv și urmă în audit_log. Din browser coloana nu se
--     poate schimba direct: un semn pus greșit mută bani (salariul instructorului, bonusul managerului).
--
-- Modelul: `enrollments.gratuitate` ('angajat' | 'special') + `acoperit_gratuitate` (cât acoperă
-- firma din rată). `suma_baza` rămâne prețul real, `suma` = ce mai are omul de plată. Acoperirea
-- o calculează un trigger la orice scriere, deci orice funcție care rescrie `suma` din preț
-- (recalcul reduceri, ajustare preț, suspendare) e readusă automat la regula de mai sus.

-- ── Coloanele ─────────────────────────────────────────────────────────────────────
alter table public.enrollments
  add column if not exists gratuitate text
    check (gratuitate in ('angajat', 'special')),
  add column if not exists acoperit_gratuitate numeric not null default 0;

comment on column public.enrollments.gratuitate is
  'angajat = voucherul lunar de angajat (300 lei/lună, se împarte pe grupele din lună); special = gratuitate asumată de owner. Rata acoperită se numără ca loc plătit. Se schimbă doar prin seteaza_gratuitate_inrolare.';
comment on column public.enrollments.acoperit_gratuitate is
  'Cât din suma_baza acoperă firma (voucher angajat / gratuitate). Calculat de trigger, nu se scrie de mână.';

create index if not exists idx_enrollments_gratuitate
  on public.enrollments (client, data_incepere)
  where gratuitate is not null;

-- ── Garda: semnul nu se schimbă din browser ──────────────────────────────────────
create or replace function public._garda_enrollments_gratuitate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((tg_op = 'INSERT' and new.gratuitate is not null)
          or (tg_op = 'UPDATE' and new.gratuitate is distinct from old.gratuitate)) then
    raise exception 'Voucherul de angajat și gratuitatea se pun doar de owner/admin, din fișa înrolării.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public._garda_enrollments_gratuitate() from public, anon, authenticated;

drop trigger if exists trg_garda_enrollments_gratuitate on public.enrollments;
create trigger trg_garda_enrollments_gratuitate
  before insert or update of gratuitate on public.enrollments
  for each row execute function public._garda_enrollments_gratuitate();

-- ── Acoperirea, calculată la orice scriere ────────────────────────────────────────
-- Voucherul de angajat se împarte pe ratele din aceeași lună în ordinea lor (data, creare, id),
-- pe prețul real al ratelor dinainte — rezultatul nu depinde de ordinea în care se scriu rândurile.
create or replace function public._enrollment_acoperire_gratuitate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_luna    date;
  v_voucher numeric;
  v_folosit numeric;
  v_baza    numeric := greatest(coalesce(new.suma_baza, 0), 0);
begin
  if new.gratuitate is null then
    new.acoperit_gratuitate := 0;
    return new;
  end if;

  if new.gratuitate = 'special' then
    new.acoperit_gratuitate := v_baza;
  else
    v_luna := date_trunc('month', new.data_incepere)::date;
    v_voucher := coalesce((_salarizare_parametri('instructor', v_luna) ->> 'voucher_lunar')::numeric, 300);
    select coalesce(sum(greatest(coalesce(e.suma_baza, 0), 0)), 0) into v_folosit
    from enrollments e
    where e.client = new.client
      and e.gratuitate = 'angajat'
      and e.id <> new.id
      and date_trunc('month', e.data_incepere)::date = v_luna
      and (e.data_reziliere is null or e.data_reziliere::date > e.data_incepere)
      and (e.data_incepere, e.created, e.id) < (new.data_incepere, new.created, new.id);
    new.acoperit_gratuitate := least(v_baza, greatest(v_voucher - v_folosit, 0));
  end if;

  new.politica_discount := 0;
  new.suma := v_baza - new.acoperit_gratuitate;
  return new;
end;
$$;

revoke all on function public._enrollment_acoperire_gratuitate() from public, anon, authenticated;

-- Numele sortează după celelalte BEFORE de pe enrollments: acoperirea are ultimul cuvânt pe `suma`.
drop trigger if exists trg_enrollment_zz_acoperire_gratuitate on public.enrollments;
create trigger trg_enrollment_zz_acoperire_gratuitate
  before insert or update on public.enrollments
  for each row execute function public._enrollment_acoperire_gratuitate();

-- ── Punerea / scoaterea semnului ──────────────────────────────────────────────────
-- Pe o serie: toate ratele clientului la grupă între p_de_la și p_pana (null = până la capăt).
-- Ratele puse pe 0 de mână primesc înapoi prețul grupei, ca acoperirea să aibă din ce acoperi.
create or replace function public._aplica_gratuitate_inrolari(
  p_client uuid,
  p_curs uuid,
  p_de_la date,
  p_pana date,
  p_tip text,
  p_motiv text,
  p_actor uuid,
  p_rol text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_curs cursuri%rowtype;
  v_loc  uuid;
  v_pret numeric;
  v_n    integer := 0;
  r      enrollments%rowtype;
begin
  if p_tip is not null and p_tip not in ('angajat', 'special') then
    raise exception 'Tip necunoscut: %', p_tip;
  end if;
  if p_motiv is null or btrim(p_motiv) = '' then
    raise exception 'Motivul e obligatoriu.';
  end if;

  select * into v_curs from cursuri where id = p_curs;
  if not found then
    raise exception 'Cursul nu mai există.';
  end if;
  select coalesce(v_curs.locatie, s.locatie) into v_loc from sali s where s.id = v_curs.sala;
  v_loc := coalesce(v_loc, v_curs.locatie);

  for r in
    select * from enrollments e
    where e.client = p_client
      and e.cursul = p_curs
      and e.data_incepere >= coalesce(p_de_la, '-infinity'::date)
      and e.data_incepere <= coalesce(p_pana, 'infinity'::date)
      and (e.data_reziliere is null or e.data_reziliere::date > e.data_incepere)
      and e.gratuitate is distinct from p_tip
    order by e.data_incepere, e.created, e.id
    for update
  loop
    if p_tip = 'angajat' and r.tip_plata = 'Per an' then
      raise exception 'Voucherul de angajat e lunar; abonamentul anual primește doar gratuitate specială.';
    end if;

    v_pret := case
      when coalesce(r.suma_baza, 0) > 0 then r.suma_baza
      when r.tip_plata = 'Per luna' then v_curs.pret_lunar
      when r.tip_plata = 'Per sedinta' then v_curs.pret_sedinta
      when r.tip_plata = 'Per an' then v_curs.pret_anual
    end;

    update enrollments
      set gratuitate = p_tip,
          suma_baza = coalesce(v_pret, suma_baza),
          suma = coalesce(v_pret, suma_baza)
      where id = r.id;

    insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                           old_value, new_value, reason, locatie_id)
    select p_actor, p_rol, 'gratuitate_inrolare', 'enrollment', r.id,
           jsonb_build_object('gratuitate', r.gratuitate, 'suma', r.suma, 'suma_baza', r.suma_baza),
           jsonb_build_object('gratuitate', e.gratuitate, 'suma', e.suma, 'suma_baza', e.suma_baza,
                              'acoperit', e.acoperit_gratuitate),
           btrim(p_motiv), v_loc
    from enrollments e where e.id = r.id;

    v_n := v_n + 1;
  end loop;

  -- Voucherul de angajat se împarte pe toate grupele din lună: ratele lui de la alte grupe se
  -- recalculează. Apoi reducerile de familie, fără rândurile acoperite.
  update enrollments set gratuitate = gratuitate
    where client = p_client and gratuitate = 'angajat';
  perform recalculate_pool_discount(p_client);

  return v_n;
end;
$$;

revoke all on function public._aplica_gratuitate_inrolari(uuid, uuid, date, date, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public._aplica_gratuitate_inrolari(uuid, uuid, date, date, text, text, uuid, text)
  to service_role;

create or replace function public.seteaza_gratuitate_inrolare(
  p_client uuid,
  p_curs uuid,
  p_de_la date,
  p_pana date,
  p_tip text,
  p_motiv text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (select is_admin()) then
    raise exception 'Doar owner/admin pot da voucher de angajat sau gratuitate.' using errcode = '42501';
  end if;
  return _aplica_gratuitate_inrolari(p_client, p_curs, p_de_la, p_pana, p_tip, p_motiv,
                                     auth.uid(), auth_role());
end;
$$;

revoke execute on function public.seteaza_gratuitate_inrolare(uuid, uuid, date, date, text, text) from public, anon;
grant execute on function public.seteaza_gratuitate_inrolare(uuid, uuid, date, date, text, text)
  to authenticated, service_role;

-- ── Numărătoarea: rata acoperită de firmă e loc plătit ────────────────────────────
create or replace function public._inrolari_platite_randuri(p_de date, p_pana date, p_cursuri uuid[], p_sedinta_30_zile boolean)
 returns table(client uuid, curs_id uuid, tip text, data_incepere date, sfarsit date)
 language sql
 stable
 set search_path to 'public'
as $function$
  select x.client, x.cursul, x.tip, x.data_incepere, x.sfarsit
  from (
    select e.client, e.cursul, e.tip_plata::text as tip, e.data_incepere,
           least(
             case
               when e.tip_plata = 'Per sedinta' and p_sedinta_30_zile then e.data_incepere + 29
               when e.tip_plata = 'Per sedinta' then e.data_incepere
               else coalesce(e.data_final, 'infinity'::date)
             end,
             coalesce((e.data_reziliere::date - 1), 'infinity'::date)
           ) as sfarsit
    from enrollments e
    where e.cursul = any(p_cursuri)
      and e.client is not null
      -- Voucherul de angajat și gratuitatea specială lasă suma pe 0, dar locul e plătit (de firmă).
      and (e.suma > 0 or e.acoperit_gratuitate > 0)
      -- Rezervarea OPEN anulată nu primește dată de reziliere și își păstrează
      -- suma. Nu se citește din `activ`: bifa se stinge și la închiderea sezonului,
      -- pe toate ședințele valide.
      and not (
        e.tip_plata = 'Per sedinta'
        and exists (select 1 from open_rezervari r
                    where r.enrollment = e.id and r.status = 'anulat')
      )
      and e.data_incepere <= p_pana
  ) x
  where x.sfarsit >= greatest(x.data_incepere, p_de);
$function$;

-- Detaliul de la salariu (admin) listează aceiași oameni pe care îi numără salariul.
do $$
declare
  v_def text := pg_get_functiondef('public.detaliu_cursanti_salariu(uuid[], integer, integer)'::regprocedure);
  v_vechi text := E'    where e.suma > 0\n    group by e.cursul, e.client';
  v_nou text := E'    where (e.suma > 0 or e.acoperit_gratuitate > 0)\n    group by e.cursul, e.client';
begin
  if position(v_vechi in v_def) = 0 then
    raise exception 'detaliu_cursanti_salariu: n-am găsit filtrul pe sumă — definiția s-a schimbat.';
  end if;
  execute replace(v_def, v_vechi, v_nou);
end;
$$;

-- ── Reducerile de familie: rata acoperită de firmă nu intră în clasament ─────────
-- Ca rândul cu voucher: nu ia locul „integral" și nu primește −10%.
do $$
declare
  f text;
  v_def text;
begin
  foreach f in array array[
    'public.recalculate_pool_discount(uuid)',
    'public.preview_pool_discount(uuid, tip_plata, numeric, uuid, boolean)'
  ] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position('and e.voucher is null' in v_def) = 0 then
      raise exception '%: n-am găsit filtrul pe voucher — definiția s-a schimbat.', f;
    end if;
    execute replace(v_def, 'and e.voucher is null', 'and e.voucher is null and e.gratuitate is null');
  end loop;
end;
$$;

-- ── Datele de azi (Alex, 9 oct. 2026) ──────────────────────────────────────────────
do $$
declare
  v_motiv_angajat constant text := 'Voucher de angajat 300 lei/lună (Alex, 9 oct. 2026): înscrierea pusă pe 0 de mână nu se mai număra la grupă.';
  v_rock constant uuid := '4179e525-990b-4cc8-8f96-ea68aa5f60fe';
begin
  -- S Rock On Q: instructorii pe voucher (Mara Caliman, Bianca David, Eva Manolica, Ioana Perju,
  -- Laura Petria, Ana Plesescu). Ioana a plătit cash septembrie ⇒ rămâne cu 300 lei credit de restituit.
  perform _aplica_gratuitate_inrolari(c, v_rock, null, null, 'angajat', v_motiv_angajat, null, 'service_role')
  from unnest(array[
    '9118043f-1cbc-5c1b-91bb-4616bda345ae', '130e8c45-e37a-5ad6-ac82-094f2ad1cc6b',
    '4b0d5bf9-b0db-512a-ae9a-8dfc2df7534a', '052cc24b-ae2e-5b54-b1b3-7fc9f4b28655',
    'c2b54451-a1b6-500d-9305-0d4a87d20145', '5edcfa17-0eb2-516d-ac3e-f388375ea71b'
  ]::uuid[]) c;

  -- S UNIQ Crew: Petruța Nitișor (recepție).
  perform _aplica_gratuitate_inrolari('80d3160c-d6c5-54ca-b316-fce72aa2a73f',
    'e1bb6753-e969-4cd1-97e9-135e64eee92a', null, null, 'angajat', v_motiv_angajat, null, 'service_role');

  -- S MQS Crew: Dominique Brehuescu, septembrie–noiembrie (din decembrie plătește).
  perform _aplica_gratuitate_inrolari('2d558dbd-2191-52ef-8a3b-4e85d47de314',
    'ecd4efbd-fa57-41c9-babf-356ba005b5bd', '2026-09-01', '2026-11-30', 'special',
    'Gratuitate specială (Alex, 9 oct. 2026): favoare pentru ajutorul dat firmei, sept.–nov.', null, 'service_role');

  -- Alexia Ignat Scântee, abonamentele anuale la S LMi Junior INT și S V Junior INC.
  perform _aplica_gratuitate_inrolari('46b328ca-9518-515a-8f7f-32a65809e9f4', c, null, null, 'special',
    'Gratuitate specială (Alex, 9 oct. 2026): familia proprietarului.', null, 'service_role')
  from unnest(array['c5d36a99-009f-4ab8-90b2-7a10cbea919d', 'f206972e-340c-4099-82a5-cea370d23bdc']::uuid[]) c;
end;
$$;
