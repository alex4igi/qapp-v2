-- Qapp v2 — Preț de recuperare la reziliere + notificare admini la modificarea
-- prețului unei înrolări.
--
-- Context business:
--  * pret_sedinta  = prețul/ședință folosit la PRORATA înrolării (cel "corect",
--    derivat din pret_anual / nr_ședințe_sezon).
--  * pret_sedinta_reziliere = prețul/ședință (mai mare) aplicat la RECUPERARE
--    când un client recurent reziliază la mijlocul lunii: managerul poate
--    recalcula ultima lună la pret_sedinta_reziliere × ședințe prezente, ca să
--    recupereze o parte din bani în loc să piardă tot.

-- ============================================================
-- 1) Coloană nouă pe cursuri
-- ============================================================
alter table cursuri
  add column if not exists pret_sedinta_reziliere integer;

comment on column cursuri.pret_sedinta_reziliere is
  'Preț/ședință de recuperare aplicat la reziliere mid-lună (recalcul ultima lună). Diferit de pret_sedinta (prorata înrolare).';

-- ============================================================
-- 2) RPC: notifică owner+admin la modificarea prețului unei înrolări
-- ============================================================
-- Apelabil de orice staff (manager+ în practică, gate-uit în UI). Security
-- definer pentru că inserarea în notifications cere is_admin() prin RLS, iar
-- managerul nu e admin. Actorul curent e exclus din destinatari.
create or replace function notify_price_change(
  p_enrollment uuid,
  p_old        numeric,
  p_new        numeric,
  p_motiv      text,
  p_context    text default 'ajustare'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_client    text;
  v_curs      text;
  v_recipient uuid;
  v_count     integer := 0;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select trim(coalesce(c.nume, '') || ' ' || coalesce(c.prenume, '')),
         cu.numele
    into v_client, v_curs
  from enrollments e
  join clienti c  on c.id = e.client
  left join cursuri cu on cu.id = e.cursul
  where e.id = p_enrollment;

  for v_recipient in
    select id from auth.users
    where raw_app_meta_data->>'role' in ('owner', 'admin')
      and id <> v_actor
  loop
    insert into notifications (recipient_user_id, kind, title, body, payload)
    values (
      v_recipient,
      'price_change',
      format('Modificare preț înrolare: %s', coalesce(nullif(v_client, ''), 'client')),
      format('%s · %s → %s RON (%s). Motiv: %s',
             coalesce(v_curs, '—'),
             coalesce(p_old::text, '—'),
             coalesce(p_new::text, '—'),
             p_context,
             coalesce(nullif(trim(p_motiv), ''), '—')),
      jsonb_build_object(
        'enrollment', p_enrollment,
        'old', p_old,
        'new', p_new,
        'context', p_context,
        'actor', v_actor
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function notify_price_change(uuid, numeric, numeric, text, text) to authenticated;
