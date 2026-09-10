-- Recepția și managerul apăsau „Șterge" pe un SMS din coadă și nu se întâmpla nimic:
-- pe `situatie_sms_uri` singura politică de delete era `situatie_sms_uri_admin_all`
-- (`is_admin()` = admin/owner). Un DELETE fără politică NU e o eroare în Postgres —
-- afectează 0 rânduri și răspunde „ok", deci butonul părea rupt fără niciun mesaj.
--
-- Le dăm dreptul doar pe rândurile NEtrimise. Un SMS plecat rămâne în jurnal:
-- „am trimis" e o afirmație pe care recepția nu trebuie să o poată șterge.
-- 'Amanat' e exclus INTENȚIONAT: mesajul stă deja în `sms_amanate` și pleacă oricum
-- după ora de ieșire din zona interzisă, iar ștergerea rândului din listă doar ar
-- ascunde trimiterea. Cine vrea să opreasca un amânat, oprește-l din sms_amanate.
drop policy if exists situatie_sms_uri_staff_delete on situatie_sms_uri;
create policy situatie_sms_uri_staff_delete
  on situatie_sms_uri for delete to authenticated
  using (
    auth_role() in ('manager', 'front_desk', 'user')
    and (status is null or status in ('De trimis', 'Esuat'))
  );
