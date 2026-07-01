-- Backstop DB anti-dublură: o singură înrolare activă ne-Per-ședință per
-- (client, cursul, data_incepere). Permite:
--   - recurent multi-lună (data_incepere diferă pe fiecare lună)
--   - ședințe drop-in multiple (`Per sedinta` exclus)
--   - re-înrolare după reziliere (rândurile reziliate excluse)
-- Blochează doar 2× same-course same-month (cazul Ciornei/Obreja).
--
-- Cutoff `data_incepere >= 2026-07-01`: nu atingem cele 63 dubluri istorice
-- (2017-2025, migrate din v1) — decizie de a nu modifica înregistrări închise
-- (aceeași politică ca la dedup prezențe). Înrolările noi sunt mereu datate
-- azi/viitor, deci sunt acoperite integral. Un re-import v1 cu date vechi nu
-- e blocat (istoric), ceea ce e dezirabil.

create unique index if not exists uq_enrollment_client_curs_data
  on enrollments (client, cursul, data_incepere)
  where not reziliat
    and tip_plata <> 'Per sedinta'
    and data_incepere >= '2026-07-01'::date;
