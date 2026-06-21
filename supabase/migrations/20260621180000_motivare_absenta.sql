-- Motivare absență cu adeverință medicală + scutire lună (feature staff qapp v2).
-- Vezi [[project-motivare-absenta]]. Flux: recepție urcă adeverința în Drive
-- (documente_client tip=Medical) → managerul aprobă pe fișa clientului → luna se
-- marchează Motivat și, dacă absențele depășesc 2× ședințe/săpt, înrolarea lunii
-- devine 0 lei (suma + suma_baza), iar plata existentă devine credit pe luna viitoare.

-- ============================================================
-- 1) Tabel de audit pentru motivările aprobate
-- ============================================================
create table if not exists motivari_absenta (
  id          uuid primary key default gen_random_uuid(),
  enrollment  uuid not null references enrollments(id) on delete cascade,
  client      uuid not null references clienti(id) on delete cascade,
  luna        date not null,                  -- ziua 1 a lunii motivate
  document    uuid references documente_client(id) on delete set null,
  observatii  text,
  absente     integer not null default 0,     -- nr. ședințe ratate (Absent+Motivat) în lună
  prag        integer not null default 0,     -- 2 × ședințe/săptămână
  scutit      boolean not null default false, -- luna a fost dedusă de plată?
  aprobat_de  uuid references auth.users(id),
  created     timestamptz not null default now()
);
create index if not exists motivari_absenta_enrollment_idx on motivari_absenta (enrollment);
create index if not exists motivari_absenta_client_idx on motivari_absenta (client);

alter table motivari_absenta enable row level security;

-- Staff (non-parinte) citește; managerul+ scrie. RPC-ul e SECURITY DEFINER, deci
-- inserarea trece de RLS — politicile sunt pentru citirea istoricului din UI.
drop policy if exists motivari_absenta_select_staff on motivari_absenta;
create policy motivari_absenta_select_staff on motivari_absenta
  for select to authenticated using (auth_role() <> 'parinte');

drop policy if exists motivari_absenta_write_manager on motivari_absenta;
create policy motivari_absenta_write_manager on motivari_absenta
  for all to authenticated
  using (is_manager() or is_admin()) with check (is_manager() or is_admin());

-- Regula stabilită pentru portal: orice tabel nou primește garda restrictivă.
drop policy if exists deny_parinte_direct on motivari_absenta;
create policy deny_parinte_direct on motivari_absenta as restrictive for all to authenticated
  using (auth_role() <> 'parinte') with check (auth_role() <> 'parinte');

-- ============================================================
-- 2) RPC — aprobă motivarea absențelor unei luni de înrolare
-- ============================================================
create or replace function aproba_motivare_absenta(
  p_enrollment uuid,
  p_document   uuid default null,
  p_observatii text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_enr        enrollments%rowtype;
  v_luna_start date;
  v_luna_end   date;
  v_sed_sapt   int;
  v_absente    int;
  v_motivate   int;
  v_prag       int;
  v_eligibil   boolean;
  v_platit     numeric;
  v_next       uuid;
  v_scutit     boolean := false;
  v_credit     text := 'niciun';
  v_actor      uuid := auth.uid();
  v_recipient  uuid;
  v_client_nume text;
  v_curs_nume  text;
begin
  if not (is_manager() or is_admin()) then
    raise exception 'forbidden: doar managerul poate aproba motivări de absență';
  end if;

  select * into v_enr from enrollments where id = p_enrollment;
  if not found then raise exception 'Înrolarea nu există.'; end if;
  if v_enr.data_incepere is null then raise exception 'Înrolarea nu are lună (data_incepere).'; end if;

  v_luna_start := date_trunc('month', v_enr.data_incepere)::date;
  v_luna_end   := (v_luna_start + interval '1 month - 1 day')::date;

  select coalesce(array_length(c.zile, 1), 0) into v_sed_sapt
  from cursuri c where c.id = v_enr.cursul;

  -- ședințe ratate în lună (Absent + cele deja Motivat dintr-o aprobare anterioară)
  select count(*) into v_absente
  from prezente p
  where p.enrollment = p_enrollment
    and p.status in ('Absent', 'Motivat')
    and p.data >= v_luna_start and p.data <= v_luna_end;

  -- marchează absențele lunii ca motivate
  update prezente
    set status = 'Motivat', updated = now()
  where enrollment = p_enrollment
    and status = 'Absent'
    and data >= v_luna_start and data <= v_luna_end;
  get diagnostics v_motivate = row_count;

  v_prag := 2 * v_sed_sapt;
  -- scutirea se aplică doar înrolărilor lunare (recurent); facultativ/anual nu mapează
  v_eligibil := v_sed_sapt > 0 and v_absente > v_prag and v_enr.tip_plata = 'Per luna';

  if v_eligibil then
    select coalesce(sum(i.suma), 0) into v_platit
    from incasari i where i.inregistrare = p_enrollment;

    -- 0 lei pe lună (suma_baza=0 obligatoriu, altfel triggerul de discount o rescrie)
    update enrollments set suma = 0, suma_baza = 0 where id = p_enrollment;
    v_scutit := true;

    if v_platit > 0 then
      -- credit = mută încasările pe rândul lunii următoare (același client+curs)
      select e2.id into v_next
      from enrollments e2
      where e2.client = v_enr.client
        and e2.cursul = v_enr.cursul
        and e2.reziliat = false
        and date_trunc('month', e2.data_incepere)::date = (v_luna_start + interval '1 month')::date
      limit 1;

      if v_next is not null then
        update incasari set inregistrare = v_next, updated = now()
        where inregistrare = p_enrollment;
        v_credit := 'luna_urmatoare';
      else
        -- fără rând pentru luna viitoare → rămâne pe lună ca sold în favoare (rest negativ)
        v_credit := 'sold_favoare';
      end if;
    end if;

    -- audit financiar către owner/admin
    select trim(coalesce(c.nume,'') || ' ' || coalesce(c.prenume,'')), cu.numele
      into v_client_nume, v_curs_nume
    from clienti c, cursuri cu where c.id = v_enr.client and cu.id = v_enr.cursul;

    for v_recipient in
      select id from auth.users
      where raw_app_meta_data->>'role' in ('owner','admin') and id <> coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid)
    loop
      insert into notifications (recipient_user_id, kind, title, body, payload)
      values (
        v_recipient, 'motivare_absenta',
        format('Scutire lună (motivare absență): %s', coalesce(nullif(v_client_nume,''),'client')),
        format('%s · %s · %s absențe (prag %s) → luna 0 lei. Credit: %s',
               coalesce(v_curs_nume,'—'), to_char(v_luna_start,'Mon YYYY'), v_absente, v_prag, v_credit),
        jsonb_build_object('enrollment', p_enrollment, 'luna', v_luna_start, 'platit', v_platit, 'credit', v_credit)
      );
    end loop;
  end if;

  insert into motivari_absenta (enrollment, client, luna, document, observatii, absente, prag, scutit, aprobat_de)
  values (p_enrollment, v_enr.client, v_luna_start, p_document, p_observatii, v_absente, v_prag, v_scutit, v_actor);

  return jsonb_build_object(
    'motivate', v_motivate, 'absente', v_absente, 'prag', v_prag,
    'scutit', v_scutit, 'credit', v_credit, 'luna', v_luna_start
  );
end;
$$;

revoke all on function aproba_motivare_absenta(uuid, uuid, text) from public;
grant execute on function aproba_motivare_absenta(uuid, uuid, text) to authenticated;
