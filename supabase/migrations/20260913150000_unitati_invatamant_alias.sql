-- Qapp v2 — aliasuri pentru unitățile de învățământ.
--
-- Denumirea oficială e cea din catalog, dar oamenii scriu porecla: „UMF", nu
-- „Universitatea de Medicină și Farmacie «Grigore T. Popa» Iași". Aliasul face
-- două lucruri:
--   1) intră în căutarea din selector (se vede și ca subtitlu, ca să confirmi
--      că ai nimerit unitatea corectă);
--   2) e recunoscut de canonicalizarea din `trg_clienti_unitate_canonic` — cine
--      tastează „umf" (recepție, portal, import) ajunge pe unitatea oficială,
--      nu creează o intrare nouă „de verificat".

alter table unitati_invatamant
  add column alias text[] not null default '{}';

comment on column unitati_invatamant.alias is
  'Porecle/prescurtări (UMF, UAIC, Politehnica). Căutabile și recunoscute la canonicalizare; denumirea oficială rămâne `nume`.';

-- Căutarea pe alias e o scanare peste ~70 de rânduri, dar indexul o ține ieftină
-- dacă lista crește.
create index unitati_invatamant_alias_idx on unitati_invatamant using gin (alias);

-- Rezolvă un text scris de om la unitatea din catalog: întâi pe numele
-- normalizat, apoi pe aliasuri. Null = nu există încă.
create or replace function match_unitate(p_text text)
returns uuid
language sql
stable
as $$
  select u.id
  from unitati_invatamant u
  where norm_unitate(u.nume) = norm_unitate(p_text)
     or exists (
       select 1 from unnest(u.alias) a
       where norm_unitate(a) = norm_unitate(p_text)
     )
  -- Potrivirea pe nume bate aliasul altei unități.
  order by (norm_unitate(u.nume) = norm_unitate(p_text)) desc
  limit 1
$$;

revoke execute on function match_unitate(text) from anon, public;
grant execute on function match_unitate(text) to authenticated;

create or replace function trg_clienti_unitate_canonic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_id   uuid;
  v_nume text;
begin
  v_norm := norm_unitate(new.unitate_invatamant);

  if v_norm is null then
    new.unitate_invatamant := null;
    new.unitate_invatamant_id := null;
    return new;
  end if;

  v_id := match_unitate(new.unitate_invatamant);

  if v_id is null then
    insert into unitati_invatamant (nume, de_verificat)
    values (btrim(new.unitate_invatamant), true)
    returning id, nume into v_id, v_nume;
  else
    select nume into v_nume from unitati_invatamant where id = v_id;
  end if;

  new.unitate_invatamant := v_nume;
  new.unitate_invatamant_id := v_id;
  return new;
end;
$$;

revoke execute on function trg_clienti_unitate_canonic() from anon, public;
