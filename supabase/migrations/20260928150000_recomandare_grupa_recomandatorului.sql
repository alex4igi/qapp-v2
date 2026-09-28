-- Recomandări: grupa recomandatorului se completează singură din înrolarea lui curentă.

-- Recepția creează / confirmă recomandarea unui lead: cine a invitat (cursantul → familia lui).
create or replace function public.atribuie_recomandare(
  p_lead                uuid,
  p_client_recomandator uuid,
  p_curs                uuid default null,
  p_nume_declarat       text default null,
  p_canal               text default 'receptie'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_rol  text := (select auth_role());
  c      campanii_recomandare%rowtype;
  v_id   uuid;
  v_fam  uuid;
  v_lead leads%rowtype;
  v_old  recomandari%rowtype;
begin
  if v_rol not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Leadul nu există.'; end if;

  select * into v_old from recomandari where lead_id = p_lead order by created desc limit 1;
  if v_old.id is not null then
    select * into c from campanii_recomandare where id = v_old.campanie_id;
    if v_old.status in ('recompensat', 'anulat') then
      raise exception 'Recomandarea e deja %; nu se mai poate schimba.', v_old.status;
    end if;
  else
    c := campanie_recomandare_activa();
    if c.id is null then raise exception 'Nu există o campanie de recomandări activă.'; end if;
  end if;

  if p_client_recomandator is not null then
    select familia into v_fam from clienti where id = p_client_recomandator;
    if v_fam is null then
      select a.familie_id into v_fam from asigura_familie_client(p_client_recomandator) a;
    end if;
    if v_fam is null then
      raise exception 'Cursantul care a invitat nu are familie și nu i se poate crea una automat (fără telefon/email pe fișă).';
    end if;
    if v_lead.id_client is not null
       and (select familia from clienti where id = v_lead.id_client) = v_fam then
      raise exception 'Invitatul e din aceeași familie cu cel care l-a invitat.';
    end if;
  end if;

  if v_old.id is null then
    insert into recomandari (campanie_id, lead_id, nume_declarat, canal, invitat_client_id)
    values (c.id, p_lead, nullif(btrim(p_nume_declarat), ''),
            case when p_canal in ('site', 'telefon', 'receptie') then p_canal else 'receptie' end,
            v_lead.id_client)
    returning id into v_id;
  else
    v_id := v_old.id;
    if nullif(btrim(p_nume_declarat), '') is not null then
      update recomandari set nume_declarat = btrim(p_nume_declarat) where id = v_id;
    end if;
  end if;

  if p_client_recomandator is not null then
    update recomandari
       set familie_recomandatoare = v_fam,
           client_recomandator    = p_client_recomandator,
           -- Grupa în care s-a promovat campania: aleasă de recepție sau, implicit,
           -- grupa curentă a cursantului care a invitat (raportul pe grupe sub prag).
           curs_recomandator      = coalesce(p_curs, (
             select e.cursul from enrollments e
              where e.client = p_client_recomandator and e.sezon_id = c.sezon_id and not e.reziliat
              order by (e.data_incepere <= current_date) desc, e.data_incepere desc
              limit 1), curs_recomandator),
           verificat_de           = auth.uid(),
           verificat_la           = now()
     where id = v_id;
  end if;

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), v_rol, 'recomandare_atribuita', 'recomandare', v_id,
          case when v_old.id is null then null
               else jsonb_build_object('familie', v_old.familie_recomandatoare, 'client', v_old.client_recomandator) end,
          jsonb_build_object('familie', v_fam, 'client', p_client_recomandator, 'lead', p_lead));

  perform evalueaza_recomandare(v_id);
  return v_id;
end;
$$;
revoke execute on function public.atribuie_recomandare(uuid, uuid, uuid, text, text) from anon, public;
