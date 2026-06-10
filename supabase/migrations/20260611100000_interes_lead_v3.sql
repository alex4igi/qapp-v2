-- interes_lead v3: un singur câmp de interes cu 5 valori, aliniat cu
-- formularul de pe quasardance.ro (decizie user 2026-06-10).
-- Remapare istoric: Gimnastică→Acrobatică; Quasar for Kids/Altceva→Nu știu încă.
-- curs_interes (text) rămâne în DB pentru istoricul datelor, dar nu se mai scrie din UI.

alter table leads alter column interes type text using interes::text;

update leads set interes = 'Acrobatică'   where interes = 'Gimnastică';
update leads set interes = 'Nu știu încă' where interes in ('Quasar for Kids', 'Altceva');

drop type interes_lead;
create type interes_lead as enum (
  'Street Dance',
  'K-pop',
  'Acrobatică',
  'Zumba',
  'Nu știu încă'
);

alter table leads alter column interes type interes_lead using interes::interes_lead;
