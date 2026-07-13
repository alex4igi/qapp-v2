-- Evenimente de grupă: teacherul creează evenimente exclusive pentru grupele lui
-- (spectacol, antrenament în parc), vizibile pe portal DOAR membrilor cu enrollment
-- activ pe acea grupă. curs NULL = eveniment studio-wide (comportamentul de până acum).

alter table evenimente
  add column curs uuid references cursuri(id) on delete cascade;

create index idx_evenimente_curs on evenimente(curs) where curs is not null;

-- Garanții server-side: un eveniment de grupă nu poate ajunge pe /servicii
-- (bilete_publice filtrează pe public) și trebuie să aibă dată — filtrul portal
-- `coalesce(data, current_date) >= current_date` ar lăsa un eveniment fără dată
-- vizibil pe veci.
alter table evenimente
  add constraint evenimente_grupa_nu_public check (curs is null or public = false),
  add constraint evenimente_grupa_are_data  check (curs is null or data is not null);

-- Teacherul gestionează DOAR evenimentele grupelor lui (M:N cursuri_teacheri).
-- USING pe rândul vechi => nu poate atinge evenimente studio-wide sau ale altor
-- grupe; WITH CHECK pe rândul nou => nu poate muta evenimentul pe o grupă străină,
-- nu-l poate face public sau cu bilet. Mutarea între propriile grupe e permisă.
create policy evenimente_teacher_grupa on evenimente
  for all to authenticated
  using (is_teacher() and curs is not null and teacher_can_access_curs(curs))
  with check (
    is_teacher() and curs is not null and teacher_can_access_curs(curs)
    and public = false and pret_bilet is null
  );

-- RPC portal: semnătură nouă cu p_client DEFAULT NULL.
-- DROP obligatoriu: CREATE cu parametru nou ar crea un overload și PostgREST ar da
-- PGRST203 (ambiguous) la apelul fără argumente. Cu default null, build-ul vechi al
-- portalului (apel fără parametri) primește doar evenimentele studio-wide.
drop function if exists get_evenimente_client();

create or replace function get_evenimente_client(p_client uuid default null)
returns table (
  eveniment_id uuid,
  nume text,
  tip tip_eveniment,
  data date,
  ora text,
  locatie text,
  descriere text,
  pret_bilet numeric,
  curs_id uuid,
  curs_nume text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nume_eveniment, e.tip, e.data::date, e.ora, e.locatia,
         e.descriere, e.pret_bilet, e.curs, c.numele
  from evenimente e
  left join cursuri c on c.id = e.curs
  where coalesce(e.data::date, current_date) >= current_date
    and (e.status is null or e.status <> 'Anulat')
    and (
      e.curs is null
      or (
        p_client is not null
        and p_client in (select client_member_ids())
        -- aceleași condiții de enrollment ca get_grupe_client, ca evenimentele
        -- de grupă să coincidă cu grupele afișate în calendar
        and exists (
          select 1 from enrollments en
          where en.client = p_client
            and en.cursul = e.curs
            and en.activ = true
            and en.reziliat = false
            and (en.data_final is null or en.data_final::date >= current_date)
        )
      )
    )
  order by e.data asc nulls last;
$$;

grant execute on function get_evenimente_client(uuid) to authenticated;
