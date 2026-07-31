-- Un transfer bancar poate plăti pentru mai mulți clienți (de regulă frați). CINE sunt
-- beneficiarii se ține în `alocari` pe rândul părinte: date minuscule, citite și scrise
-- exclusiv împreună cu rândul — un tabel-copil ar adăuga RLS + RPC-uri fără câștig.
--   alocari — [{client_id, familia_id, nume}]
--
-- BANII rămân în `linii`: fiecare linie primește `client_id` (cui i se atribuie), deci
-- suma per client și starea „plătit" se derivă, nu se dublează. Liniile mai vechi nu au
-- client_id și rămân valide (grup „Nealocat").
--
-- Persistarea rezolvă și bug-ul „potrivirea clientului se pierde la reload": până acum
-- alegerea trăia doar în state-ul React din BancaTab.
alter table facturi_fgo
  add column if not exists alocari jsonb not null default '[]'::jsonb;

alter table facturi_fgo drop constraint if exists facturi_fgo_alocari_array;
alter table facturi_fgo add constraint facturi_fgo_alocari_array
  check (jsonb_typeof(alocari) = 'array');

comment on column facturi_fgo.alocari is
  'Beneficiarii transferului: [{client_id, familia_id, nume}]. Suma și starea plății per client se derivă din linii[].client_id.';
