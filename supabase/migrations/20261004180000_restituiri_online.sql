-- Restituirea unei plăți online (Netopia) cu tot ce urmează: încasarea negativă pe
-- aceleași rânduri, urma în audit_log, rezervarea OPEN anulată la restituirea
-- integrală și stornarea facturii FGO (aceasta din urmă în edge function `netopia-refund`).
--
-- Două moduri: `netopia` = aplicația cere returul prin API (`/operation/credit`);
-- `manual` = returul s-a făcut în panoul Netopia, aplicația doar îl înregistrează.
-- Un rând stă `in_curs` cât timp apelul la Netopia e pe drum: indexul unic parțial
-- împiedică a doua restituire pe aceeași comandă în paralel, iar dacă apelul se
-- întrerupe rândul rămâne vizibil, nu se pierde.
--
-- Funcțiile le cheamă DOAR edge function-ul (service_role) — gardul de rol
-- (owner/admin) e acolo, iar actorul vine ca parametru pentru audit_log.

create table public.restituiri_online (
  id              uuid primary key default gen_random_uuid(),
  order_ref       text not null references public.netopia_orders(order_ref),
  suma            numeric not null check (suma > 0),
  motiv           text not null check (btrim(motiv) <> ''),
  mod             text not null check (mod in ('netopia', 'manual')),
  status          text not null default 'in_curs' check (status in ('in_curs', 'efectuata', 'esuata')),
  netopia_raspuns jsonb,
  eroare          text,
  -- [{sursa: incasare pozitivă, restituire: incasarea negativă, suma}]
  alocare         jsonb,
  fgo_status      text check (fgo_status in ('stornata', 'de_stornat_manual', 'eroare', 'fara_factura')),
  fgo_storno      text,
  fgo_eroare      text,
  actor_id        uuid references auth.users(id) on delete set null,
  actor_role      text not null,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now()
);

create unique index restituiri_online_un_in_curs on public.restituiri_online(order_ref)
  where status = 'in_curs';
create index restituiri_online_order_idx on public.restituiri_online(order_ref);

create trigger trg_restituiri_online_updated
  before update on public.restituiri_online
  for each row execute function set_updated_timestamp();

alter table public.restituiri_online enable row level security;

-- Scrierea trece doar prin edge function (service_role); din aplicație doar se citește.
revoke all on public.restituiri_online from anon, authenticated, public;
grant select on public.restituiri_online to authenticated;
grant all on public.restituiri_online to service_role;

create policy restituiri_online_select on public.restituiri_online
  for select to authenticated using ((select auth_role()) in ('owner', 'admin'));
create policy deny_parinte_direct on public.restituiri_online as restrictive for all to authenticated
  using ((select auth_role()) <> 'parinte') with check ((select auth_role()) <> 'parinte');
create policy deny_marketing_direct on public.restituiri_online as restrictive for all to authenticated
  using ((select auth_role()) <> 'marketing') with check ((select auth_role()) <> 'marketing');
create policy deny_teacher_direct on public.restituiri_online as restrictive for all to authenticated
  using ((select auth_role()) <> 'teacher') with check ((select auth_role()) <> 'teacher');

-- ============================================================
-- Încasările pozitive ale unei comenzi, cu cât a mai rămas de restituit din fiecare.
-- Legătura comandă → încasare e referința din observații (o scrie confirm_netopia_payment:
-- „Plată online Netopia <ref>", „Rezervare online Netopia <ref>", „Bilete online Netopia <ref>").
-- ============================================================
create or replace function public._restituire_surse(p_order_ref text)
returns table (id uuid, ramas numeric)
language sql
stable
security definer
set search_path = public
as $$
  with restituit as (
    select (a->>'sursa')::uuid as sursa, sum((a->>'suma')::numeric) as suma
    from restituiri_online r, jsonb_array_elements(coalesce(r.alocare, '[]'::jsonb)) a
    where r.order_ref = p_order_ref and r.status = 'efectuata'
    group by 1
  )
  select i.id, i.suma - coalesce(rs.suma, 0)
  from incasari i
  left join restituit rs on rs.sursa = i.id
  where i.suma > 0
    and i.observatii like '%Netopia ' || p_order_ref || '%'
  order by i.data desc nulls last, i.id desc;
$$;

revoke execute on function public._restituire_surse(text) from anon, authenticated, public;
grant execute on function public._restituire_surse(text) to service_role;

-- ============================================================
-- 1) Începe: validează și deschide rândul `in_curs`.
-- ============================================================
create or replace function public.restituire_online_incepe(
  p_order_ref  text,
  p_suma       numeric,
  p_motiv      text,
  p_mod        text,
  p_actor      uuid,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order     netopia_orders%rowtype;
  v_motiv     text := nullif(btrim(p_motiv), '');
  v_restituit numeric;
  v_surse     numeric;
  v_ntp       text;
  v_id        uuid;
begin
  if v_motiv is null then
    raise exception 'Motivul restituirii e obligatoriu.';
  end if;
  if p_suma is null or p_suma <= 0 then
    raise exception 'Suma de restituit trebuie să fie mai mare ca zero.';
  end if;
  if p_mod not in ('netopia', 'manual') then
    raise exception 'Mod de restituire necunoscut.';
  end if;

  select * into v_order from netopia_orders where order_ref = p_order_ref for update;
  if not found then
    raise exception 'Comanda online nu există.';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'Comanda nu e o plată reușită, n-ai ce restitui.';
  end if;

  if exists (select 1 from restituiri_online where order_ref = p_order_ref and status = 'in_curs') then
    raise exception 'Pe comanda asta e deja o restituire neterminată. Închide-o întâi.';
  end if;

  select coalesce(sum(suma), 0) into v_restituit
    from restituiri_online where order_ref = p_order_ref and status = 'efectuata';
  if p_suma > v_order.amount - v_restituit + 0.004 then
    raise exception 'Se pot restitui cel mult % lei (plătit % lei, restituit deja % lei).',
      v_order.amount - v_restituit, v_order.amount, v_restituit;
  end if;

  select coalesce(sum(ramas), 0) into v_surse from _restituire_surse(p_order_ref);
  if p_suma > v_surse + 0.004 then
    raise exception 'Încasările comenzii din registru acoperă doar % lei (au fost editate, mutate sau șterse?). Corectează registrul întâi.',
      v_surse;
  end if;

  -- netopia_transaction_id = ntpID venit în IPN (sau un marcaj MANUAL-… pus de mână)
  v_ntp := coalesce(v_order.ntp_id, v_order.netopia_transaction_id);
  if p_mod = 'netopia' and (v_ntp is null or v_ntp !~ '^[0-9]+$') then
    raise exception 'Comanda nu are id de tranzacție Netopia. Fă returul din panoul Netopia și înregistrează-l ca făcut manual.';
  end if;

  insert into restituiri_online (order_ref, suma, motiv, mod, actor_id, actor_role)
  values (p_order_ref, round(p_suma, 2), v_motiv, p_mod, p_actor, p_actor_role)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'ntp_id', v_ntp);
end;
$$;

revoke execute on function public.restituire_online_incepe(text, numeric, text, text, uuid, text) from anon, authenticated, public;
grant execute on function public.restituire_online_incepe(text, numeric, text, text, uuid, text) to service_role;

-- ============================================================
-- 2) Finalizează: banii au plecat → încasări negative + audit + rezervare.
-- ============================================================
create or replace function public.restituire_online_finalizeaza(p_id uuid, p_netopia jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r         restituiri_online%rowtype;
  v_order     netopia_orders%rowtype;
  v_src       record;
  v_inc       incasari%rowtype;
  v_rest      numeric;
  v_take      numeric;
  v_neg       uuid;
  v_alocare   jsonb := '[]'::jsonb;
  v_locatie   uuid;
  v_restituit numeric;
  v_integral  boolean;
begin
  select * into v_r from restituiri_online where id = p_id for update;
  if not found then
    raise exception 'Restituirea nu există.';
  end if;
  if v_r.status <> 'in_curs' then
    raise exception 'Restituirea e deja închisă (%).', v_r.status;
  end if;

  select * into v_order from netopia_orders where order_ref = v_r.order_ref for update;

  -- Din rândul cel mai recent spre cel mai vechi: la o plată pe mai multe luni,
  -- restituirea parțială scoate întâi luna cea mai îndepărtată.
  v_rest := v_r.suma;
  for v_src in select * from _restituire_surse(v_r.order_ref) loop
    exit when v_rest <= 0.004;
    continue when v_src.ramas <= 0.004;
    v_take := least(v_rest, v_src.ramas);

    select * into v_inc from incasari where id = v_src.id;
    v_locatie := coalesce(v_locatie, v_inc.locatie);

    insert into incasari (client, inregistrare, datorie, bilet, data, suma, metoda, categorie,
                          sezon, locatie, observatii)
    values (v_inc.client, v_inc.inregistrare, v_inc.datorie, v_inc.bilet, current_date, -v_take,
            'Online', v_inc.categorie, v_inc.sezon, v_inc.locatie,
            'Restituire pe card (comanda ' || v_r.order_ref || '): ' || v_r.motiv)
    returning id into v_neg;

    v_alocare := v_alocare || jsonb_build_object('sursa', v_src.id, 'restituire', v_neg, 'suma', v_take);
    v_rest := v_rest - v_take;
  end loop;

  if v_rest > 0.004 then
    raise exception 'Încasările comenzii din registru nu mai acoperă % lei din restituire. Banii au plecat: corectează registrul și reia înregistrarea.',
      v_rest;
  end if;

  update restituiri_online
     set status = 'efectuata',
         alocare = v_alocare,
         netopia_raspuns = coalesce(p_netopia, netopia_raspuns),
         eroare = null
   where id = p_id;

  select coalesce(sum(suma), 0) into v_restituit
    from restituiri_online where order_ref = v_r.order_ref and status = 'efectuata';
  v_integral := v_restituit >= v_order.amount - 0.004;

  -- Decis de Alex (04.10.2026): restituirea integrală a unei rezervări OPEN o anulează
  -- și eliberează locul — ca anuleaza_rezervare_open. La abonament se ating doar banii.
  if v_integral and v_order.order_type = 'rezervare' and v_order.rezervare_id is not null then
    update open_rezervari
       set status = 'anulat', anulat_at = now(),
           anulat_motiv = 'plată restituită: ' || v_r.motiv
     where id = v_order.rezervare_id and status <> 'anulat';
    update enrollments set activ = false
     where id = (select enrollment from open_rezervari where id = v_order.rezervare_id)
       and tip_plata = 'Per sedinta';
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,
                         old_value, new_value, reason, locatie_id)
  values (v_r.actor_id, v_r.actor_role, 'restituire_online', 'restituire_online', p_id,
          jsonb_build_object('order_ref', v_r.order_ref, 'platit', v_order.amount,
                             'restituit_inainte', v_restituit - v_r.suma),
          jsonb_build_object('suma', v_r.suma, 'mod', v_r.mod, 'alocare', v_alocare,
                             'integral', v_integral),
          v_r.motiv, v_locatie);

  return jsonb_build_object(
    'ok', true,
    -- stornarea automată: doar când restituirea asta, singură, acoperă toată plata
    'storno_integral', v_integral and v_r.suma >= v_order.amount - 0.004,
    'integral', v_integral
  );
end;
$$;

revoke execute on function public.restituire_online_finalizeaza(uuid, jsonb) from anon, authenticated, public;
grant execute on function public.restituire_online_finalizeaza(uuid, jsonb) to service_role;
