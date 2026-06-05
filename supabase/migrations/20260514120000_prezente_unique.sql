-- Qapp v2 — o singură înregistrare de prezență per înrolare per zi.
-- Permite upsert-ul prezenței (onConflict: enrollment,data) din modulul Prezențe.
alter table prezente
  add constraint uq_prezente_enrollment_data unique (enrollment, data);
