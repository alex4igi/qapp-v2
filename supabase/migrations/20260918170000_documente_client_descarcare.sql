-- Descărcarea documentelor de către client (portal + pagina de semnare).
--
-- Contractul semnat ajunge în DOUĂ locuri: folderul intern de Google Drive
-- (`documente_client.link`, pentru staff) și bucketul PRIVAT `contracte`
-- (`final/<contract_id>.pdf`). Fișierul din Drive nu primește nicio permisiune
-- de partajare, deci linkul întoarce 401 pentru părinte — practic, până acum
-- nimeni din afara studioului nu-și putea deschide propriul contract.
--
-- Sursa pentru client devine copia din Storage, servită prin signed URL scurt.
-- `link` rămâne neatins (staff-ul lucrează în continuare pe Drive).

alter table documente_client add column if not exists storage_path text;

comment on column documente_client.storage_path is
  'Cale în bucketul privat `contracte` (ex. final/<contract_id>.pdf). Când e setată, clientul primește documentul prin signed URL; `link` (Drive) rămâne canalul intern.';

-- Backfill pentru contractele deja finalizate. Rândul principal e legat prin
-- contracte.documente_client_id; frații (contract pe toată familia) au doar
-- ștampila „(contract <primele 8 caractere>)" în observații.
update documente_client d
   set storage_path = c.pdf_storage_path
  from contracte c
 where d.storage_path is null
   and c.status = 'finalizat'
   and c.pdf_storage_path is not null
   and (d.id = c.documente_client_id
        or d.observatii like '%(contract ' || left(c.id::text, 8) || ')%');

-- Descărcarea intră în jurnalul probatoriu al contractului.
alter table contract_events drop constraint if exists contract_events_tip_check;
alter table contract_events add constraint contract_events_tip_check check (tip = any (array[
  'creat', 'trimis', 'retrimis', 'sms_pus_in_coada', 'sms_trimis', 'sms_amanat',
  'email_trimis', 'deschis', 'consimtamant', 'semnat', 'pdf_generat', 'sigilat',
  'drive_upload', 'gate_semnat', 'reminder', 'expirat', 'respins', 'anulat',
  'descarcat', 'eroare'
]));

-- Portalul cere calea unui document; verificarea de apartenență stă aici, o
-- singură dată (edge function-ul portal-document doar semnează calea întoarsă).
create or replace function get_document_storage_path(p_document uuid)
returns text
language sql stable security definer set search_path = public as $$
  select d.storage_path
  from documente_client d
  where d.id = p_document
    and d.client in (select client_member_ids());
$$;
revoke execute on function get_document_storage_path(uuid) from anon, public;
grant execute on function get_document_storage_path(uuid) to authenticated;

-- Lista de documente întoarce și calea, ca portalul să știe care rând are
-- descărcare directă și care rămâne pe link extern.
drop function if exists get_documente_client(uuid);
create function get_documente_client(p_client uuid)
returns table (
  id uuid,
  tip tip_document,
  titlu text,
  link text,
  data_expirarii date,
  observatii text,
  storage_path text
)
language sql stable security definer set search_path = public as $$
  select d.id, d.tip, d.titlu, d.link, d.data_expirarii::date, d.observatii, d.storage_path
  from documente_client d
  where d.client = p_client
    and p_client in (select client_member_ids())
  order by d.created desc;
$$;
revoke execute on function get_documente_client(uuid) from anon, public;
grant execute on function get_documente_client(uuid) to authenticated;
