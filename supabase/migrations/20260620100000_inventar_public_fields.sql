-- STEP 1 unificare inventar↔produse_publice: inventarul devine sursa unică pentru
-- articolele afișate pe portalul de membri (/servicii). Flagul `public` controlează
-- vizibilitatea pentru ORICE categorie (nu doar Merch). Câmpurile *_public sunt
-- override-uri opționale; fallback la valorile interne (descriere/pret).
-- Aditiv — coloanele moștenesc politicile RLS existente (authenticated select/admin write).

alter table inventar
  add column if not exists public            boolean not null default false,
  add column if not exists pret_public       text,
  add column if not exists descriere_publica text,
  add column if not exists ordine_public     integer not null default 0;

create index if not exists idx_inventar_public on inventar(public) where public;
