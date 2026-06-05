-- Qapp v2 — Reînscrierile se aplică doar cursurilor recurente.
--
-- Cursurile facultative se plătesc per ședință/lună fără angajament de sezon,
-- deci conceptul de „reînscriere pentru sezonul nou" nu li se aplică.
-- Adăugăm guard în activate_reinscriere pentru a refuza explicit cursurile cu
-- facultativ = true, chiar dacă din greșeală au pret_lunar_promo setat.

create or replace function activate_reinscriere(
  p_client_id uuid,
  p_curs_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo numeric;
  v_facultativ boolean;
  v_count integer := 0;
  v_cutoff date := date_trunc('month', current_date + interval '1 month')::date;
begin
  select pret_lunar_promo, facultativ
    into v_promo, v_facultativ
    from cursuri
   where id = p_curs_id;

  if v_facultativ then
    raise exception 'Reînscrierile se aplică doar cursurilor recurente.';
  end if;

  if v_promo is null then
    raise exception 'Cursul nu are preț promo configurat (pret_lunar_promo).';
  end if;

  update enrollments
  set suma = v_promo,
      este_reinscriere = true,
      updated = now()
  where client = p_client_id
    and cursul = p_curs_id
    and reziliat = false
    and data_incepere >= v_cutoff;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
