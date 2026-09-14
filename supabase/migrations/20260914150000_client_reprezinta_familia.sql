-- Clientul major care se reprezintă singur.
--
-- Contractul se trimite mereu unei familii (contracte.familie_id e obligatoriu, iar
-- precompletarea, CNP-ul și reminderele pornesc de acolo). Un adult fără familie nu
-- putea primi contract. Soluția: o familie creată automat, în care reprezentantul e
-- chiar clientul, cu numele, telefonul și emailul lui ținute sincron.
--
-- Bifa stă pe client, nu pe familie: o a doua cheie externă între clienti și familii
-- ar face ambigue embed-urile PostgREST existente (clienti ↔ familii).

alter table clienti
  add column if not exists reprezinta_familia boolean not null default false;

comment on column clienti.reprezinta_familia is
  'Clientul e chiar reprezentantul familiei lui (adult care semnează singur). Numele, telefonul și emailul se copiază automat pe familie.';

-- Un singur client-reprezentant per familie; altfel două fișe s-ar suprascrie reciproc.
create unique index if not exists clienti_reprezinta_familia_uidx
  on clienti (familia) where reprezinta_familia;

-- Bifa ține de familia în care a fost pusă: mutat în altă familie (ex. a partenerului),
-- clientul nu mai are voie să-i rescrie datele.
create or replace function trg_clienti_reprezinta_familia_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.familia is null
     or (old.familia is not null and new.familia is distinct from old.familia) then
    new.reprezinta_familia := false;
  end if;
  return new;
end;
$$;

drop trigger if exists clienti_reprezinta_familia_reset on clienti;
create trigger clienti_reprezinta_familia_reset
  before update of familia, reprezinta_familia on clienti
  for each row execute function trg_clienti_reprezinta_familia_reset();

-- security definer: sincronizarea nu trebuie să depindă de dreptul celui care editează
-- clientul pe tabelul familii (altfel RLS ar sări rândul fără eroare).
create or replace function trg_clienti_sync_familie_reprezentant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.reprezinta_familia or new.familia is null then
    return null;
  end if;
  if old.reprezinta_familia
     and row(new.nume, new.prenume, new.telefon, new.email, new.familia)
         is not distinct from row(old.nume, old.prenume, old.telefon, old.email, old.familia) then
    return null;
  end if;

  update familii f set
    -- redenumim familia doar dacă poartă încă numele vechi al clientului
    nume_familie = case
      when trim(f.nume_familie) = trim(old.nume || ' ' || coalesce(old.prenume, ''))
        then trim(new.nume || ' ' || coalesce(new.prenume, ''))
      else f.nume_familie
    end,
    nume_reprezentant    = new.nume,
    prenume_reprezentant = new.prenume,
    -- un câmp golit pe fișă nu șterge contactul familiei
    telefon              = coalesce(nullif(trim(new.telefon), ''), f.telefon),
    email                = coalesce(nullif(trim(new.email), ''), f.email)
  where f.id = new.familia;

  return null;
end;
$$;

revoke execute on function trg_clienti_sync_familie_reprezentant() from anon, public;

drop trigger if exists clienti_sync_familie_reprezentant on clienti;
create trigger clienti_sync_familie_reprezentant
  after update of nume, prenume, telefon, email, familia, reprezinta_familia on clienti
  for each row execute function trg_clienti_sync_familie_reprezentant();

-- Creează familia unui client major fără familie, cu el ca reprezentant.
-- security invoker: RLS pe familii/clienti decide cine poate (aceleași roluri de staff
-- care trimit contracte).
create or replace function creeaza_familie_proprie(p_client_id uuid)
returns table (familie_id uuid, familie_nume text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  c clienti%rowtype;
  v_id uuid;
  v_nume text;
begin
  select * into c from clienti where id = p_client_id for update;
  if not found then
    raise exception 'Clientul nu există.';
  end if;
  if c.familia is not null then
    raise exception 'Clientul are deja o familie.';
  end if;
  if c.data_nasterii is null then
    raise exception 'Completează data nașterii: doar un client major se poate reprezenta singur.';
  end if;
  if c.data_nasterii > (current_date - interval '18 years')::date then
    raise exception 'Clientul e minor: contractul îl semnează un părinte. Adaugă familia cu părintele.';
  end if;
  if nullif(trim(c.telefon), '') is null and nullif(trim(c.email), '') is null then
    raise exception 'Clientul nu are nici telefon, nici email: linkul de semnare n-ar avea unde să plece.';
  end if;

  v_nume := trim(c.nume || ' ' || coalesce(c.prenume, ''));

  insert into familii (
    nume_familie, nume_reprezentant, prenume_reprezentant, telefon, email,
    opt_out_marketing, opt_out_la, opt_out_motiv
  )
  values (
    v_nume, c.nume, c.prenume, nullif(trim(c.telefon), ''), nullif(trim(c.email), ''),
    c.opt_out_marketing, c.opt_out_la, c.opt_out_motiv
  )
  returning id into v_id;

  update clienti set familia = v_id, reprezinta_familia = true where id = c.id;

  return query select v_id, v_nume;
end;
$$;

grant execute on function creeaza_familie_proprie(uuid) to authenticated;
revoke execute on function creeaza_familie_proprie(uuid) from anon, public;

-- Familiile de un singur adult create până acum (în principal la conversia de lead)
-- au deja clientul drept reprezentant — le marcăm, ca să intre în sincronizare.
-- Fără sincronizare la marcare: datele de contact existente ale familiei rămân neatinse.
alter table clienti disable trigger clienti_sync_familie_reprezentant;

update clienti cl
   set reprezinta_familia = true
  from familii f
 where f.id = cl.familia
   and not cl.reprezinta_familia
   and cl.data_nasterii <= (current_date - interval '18 years')::date
   and lower(trim(f.nume_reprezentant)) = lower(trim(cl.nume))
   and lower(trim(coalesce(f.prenume_reprezentant, ''))) = lower(trim(coalesce(cl.prenume, '')))
   and (select count(*) from clienti m where m.familia = f.id) = 1;

alter table clienti enable trigger clienti_sync_familie_reprezentant;
