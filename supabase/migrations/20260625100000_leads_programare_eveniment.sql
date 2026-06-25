-- Programarea unui lead poate fi pe un curs SAU pe un eveniment (ora demonstrativa/gratuita).
-- Ora se rezolva la momentul programarii (din curs.ora/ore_pe_zi sau evenimente.ora) si se
-- stocheaza redundant pentru a alimenta SMS-urile fara recalcul in edge functions.
alter table programari_leads
  add column if not exists eveniment_programat uuid references evenimente(id) on delete set null,
  add column if not exists ora text;

-- Evenimentele pot avea ora, ca sa apara cu ora corecta in lista de programare si in roster.
alter table evenimente
  add column if not exists ora text;
