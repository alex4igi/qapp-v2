-- GDPR, Faza 4: cererea de acces / portabilitate (art. 15 și 20). Tot ce ține de un
-- client, într-un singur JSON pe care owner/admin îl descarcă din fișă și îl trimite
-- omului. Exportul lasă urmă în audit_log (cine, când, motivul cererii).
--
-- Nu intră: parola și sesiunile de portal, jurnalul intern de audit, notele altor
-- membri ai familiei. Fișierele (PDF-uri) nu sunt în JSON — doar lista lor.

create or replace function gdpr_export_client(p_client uuid, p_motiv text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_familia uuid;
  v_leads uuid[];
  v_rez jsonb;
begin
  if (select auth_role()) not in ('owner', 'admin') then
    raise exception 'Acces refuzat.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motiv, '')), '') is null then
    raise exception 'Motivul e obligatoriu.';
  end if;

  select familia into v_familia from clienti where id = p_client;
  if not found then
    raise exception 'Clientul nu există.';
  end if;
  select coalesce(array_agg(id), '{}') into v_leads from leads where id_client = p_client;

  v_rez := jsonb_build_object(
    'generat_la', now(),
    'operator', 'Quasar Dance',
    'client', (select to_jsonb(c) - 'auth_user_id' - 'old_user_id' from clienti c where id = p_client),
    'date_facturare', (select to_jsonb(f) from clienti_facturare f where client_id = p_client),
    'familie', (select to_jsonb(f) - 'auth_user_id' from familii f where id = v_familia),
    'familie_semnatar', (select to_jsonb(s) from familii_date_semnatar s where familie_id = v_familia),
    'familie_facturare', (select to_jsonb(f) from familii_facturare f where familie_id = v_familia),
    'inscrieri', (select coalesce(jsonb_agg(to_jsonb(e) order by e.data_incepere), '[]') from enrollments e where client = p_client),
    'prezente', (select coalesce(jsonb_agg(to_jsonb(p) order by p.data), '[]') from prezente p where client = p_client),
    'incasari', (select coalesce(jsonb_agg(to_jsonb(i) order by i.data), '[]') from incasari i where client = p_client),
    'datorii', (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from datorii d where client = p_client),
    'motivari_absenta', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from motivari_absenta m where client = p_client),
    'evaluari', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from evaluari e where client = p_client),
    'evenimente', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from evenimente_participanti e where client = p_client),
    'spectacole', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from spectacol_act_performeri s where client = p_client),
    'bilete', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from bilete b where client = p_client),
    'rezervari_open', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from open_rezervari o where client = p_client),
    'inchirieri', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from inchirieri i where client = p_client),
    'vouchere', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from vouchere v where client = p_client),
    'vouchere_folosite', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from voucher_redemptions v where client = p_client),
    'plati_online', (select coalesce(jsonb_agg(to_jsonb(n) - 'fifo_plan' - 'auth_user_id'), '[]') from netopia_orders n where client_id = p_client),
    'facturi', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from facturi_fgo f where client_id = p_client),
    'contracte', (select coalesce(jsonb_agg(to_jsonb(c) - 'semnatura_path' - 'pdf_storage_path' - 'token_hash'), '[]')
                  from contracte c where client_id = p_client or (familie_id = v_familia and client_id is null)),
    'documente', (select coalesce(jsonb_agg(to_jsonb(d) - 'storage_path'), '[]') from documente_client d where client = p_client),
    'contacte', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from client_contacte c where client_id = p_client),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from feedback f where autor = p_client),
    'reinscrieri', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from reinscrieri_semnate r where client = p_client),
    'emailuri_trimise', (select coalesce(jsonb_agg(jsonb_build_object('data', e.trimis_la, 'catre', e.to_email, 'subiect', e.subject)), '[]')
                         from email_logs e where client_id = p_client or lead_id = any(v_leads)),
    'leaduri', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from leads l where id = any(v_leads)),
    'programari_lead', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from programari_leads p where lead = any(v_leads)),
    'contacte_lead', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from lead_contacte c where lead_id = any(v_leads)),
    'sms_trimise', (select coalesce(jsonb_agg(jsonb_build_object('data', s.trimis_la, 'telefon', s.telefon, 'mesaj', s.mesaj)), '[]')
                    from sms_logs s where lead_id = any(v_leads)),
    'recomandari', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from recomandari r
                    where lead_id = any(v_leads) or client_recomandator = p_client or invitat_client_id = p_client)
  );

  insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, reason)
  values (auth.uid(), (select auth_role()), 'client_date_exportate', 'client', p_client, p_motiv);

  return v_rez;
end;
$$;

revoke execute on function gdpr_export_client(uuid, text) from anon, public;
grant execute on function gdpr_export_client(uuid, text) to authenticated, service_role;

-- Anonimizarea (20260927215952) e mai veche decât campania de recomandări: numele
-- declarat al recomandatorului rămânea legat de om.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('anonimizeaza_client(uuid, text)'::regprocedure);
  if v_def not like '%update recomandari%' then
    v_def := replace(v_def,
      '  -- Urmele vechi din jurnal',
      E'  update recomandari set nume_declarat = null\n'
      || E'   where lead_id = any(v_leads) or client_recomandator = p_client or invitat_client_id = p_client;\n\n'
      || '  -- Urmele vechi din jurnal');
    if v_def not like '%update recomandari%' then
      raise exception 'anonimizeaza_client: markerul nu a fost găsit';
    end if;
    execute v_def;
  end if;
end $$;
