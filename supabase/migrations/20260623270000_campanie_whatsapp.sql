-- WhatsApp ca sursă de leads (sursa = campanie în campanii_promovare).
-- Idempotent: inserează doar dacă nu există deja o campanie numită „WhatsApp".
insert into campanii_promovare (nume, canal_comunicare)
select 'WhatsApp', 'Online'::canal_comunicare
where not exists (
  select 1 from campanii_promovare where lower(nume) = 'whatsapp'
);
