-- Qapp v2 — schema de bază (migrare 1:1 din PocketBase v1)
-- 22 tabele de date. Relațiile single -> coloane FK; relațiile multi -> uuid[].

-- ============================================================
-- ENUMS
-- ============================================================
create type canal_comunicare   as enum ('Online', 'Offline');
create type canale_online      as enum ('Meta ADS', 'Google ADS', 'TikTok Ads', 'Organic');
create type sex                as enum ('B', 'F');
create type status_client      as enum ('Activ', 'Inactiv', 'EXclient');
create type marime_tricou      as enum ('110cm/4ani', '122cm/6ani', '134cm/8ani', '146cm/10ani', '158cm/12ani', 'XS', 'S', 'M', 'L', 'XL', 'XXL');
create type nivel_curs         as enum ('Incepator', 'Intermediar', 'Avansat', 'Trupa');
create type varsta_curs        as enum ('Tiny 4-7', 'Junior 7-10', 'Varsity 11-15', 'Teens 15-20', 'Students 20-25', 'Adults 25+', 'Mixt');
create type zi_saptamana       as enum ('Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica');
create type tip_plata          as enum ('Per sedinta', 'Per luna', 'Per an');
create type status_eveniment   as enum ('Urmator', 'Finalizat', 'Anulat');
create type tip_feedback       as enum ('Sesizare', 'Review');
create type metoda_plata       as enum ('Cash', 'Card', 'Transfer', 'Revolut');
create type categorie_inventar as enum ('Haine', 'Accesorii', 'Costume', 'Merch', 'Consumabil');
create type interes_lead       as enum ('Dans', 'Gimnastica', 'K-Pop', 'Contemporan');
create type status_lead        as enum ('De revenit', 'Programat', 'Convertit', 'Nu doreste');
create type status_prezenta    as enum ('Prezent', 'Absent', 'Motivat');
create type interes_programare as enum ('Dans', 'Gimnastica');
create type status_prospect    as enum ('Nou', 'Programat', 'De revenit', 'Convertit', 'Nu doreste');
create type sursa_prospect     as enum ('Meta ADS', 'Google ADS', 'Events', 'Website', 'Organic');
create type status_sms         as enum ('De trimis', 'In curs de trimitere', 'Trimis', 'Esuat');
create type nivel_teacher      as enum ('Junior', 'Senior', 'Expert');
create type tip_voucher        as enum ('Valoare', 'Procent', 'Special');

-- ============================================================
-- TRIGGER: actualizare automată coloana `updated`
-- ============================================================
create or replace function set_updated_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated = now();
  return new;
end;
$$;

-- ============================================================
-- TABELE
-- ============================================================

create table locatii (
  id      uuid primary key default gen_random_uuid(),
  nume    text not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create table sezoane (
  id                uuid primary key default gen_random_uuid(),
  numele_sezonului  text not null,
  data_incepere     date,
  data_final        date,
  created           timestamptz not null default now(),
  updated           timestamptz not null default now()
);

create table sali (
  id          uuid primary key default gen_random_uuid(),
  nume        text not null,
  locatie     uuid,
  capacitate  integer,
  old_loc_id  bigint,
  created     timestamptz not null default now(),
  updated     timestamptz not null default now()
);

create table teacheri (
  id              uuid primary key default gen_random_uuid(),
  nume            text not null,
  prenume         text,
  data_nasterii   date,
  telefon         text,
  email           text,
  link_contract   text,
  poza            text,
  nivelul         nivel_teacher,
  observatii      text,
  marime_tricou   marime_tricou,
  old_teacher_id  bigint,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now()
);

create table familii (
  id                        uuid primary key default gen_random_uuid(),
  nume_familie              text not null,
  nume_reprezentant         text,
  prenume_reprezentant      text,
  email                     text,
  telefon                   text,
  telefon_2                 text,
  metoda_plata              text,
  metoda_comunicare         text,
  observatii                text,
  doreste_sa_apara_in_poze  boolean not null default false,
  created                   timestamptz not null default now(),
  updated                   timestamptz not null default now()
);

create table campanii_promovare (
  id                uuid primary key default gen_random_uuid(),
  nume              text not null,
  descrierea        text,
  canal_comunicare  canal_comunicare,
  canale_online     canale_online,
  rezultate         numeric,
  bani              text,
  created           timestamptz not null default now(),
  updated           timestamptz not null default now()
);

create table clienti (
  id                   uuid primary key default gen_random_uuid(),
  nume                 text not null,
  prenume              text,
  email                text,
  telefon              text,
  telefonul_2          text,
  foto                 text,
  data_nasterii        date,
  sexul                sex,
  familia              uuid,
  status               status_client,
  participari_concurs  uuid[] not null default '{}',
  link_contract        text,
  marime_tricou        marime_tricou,
  old_user_id          bigint,
  created              timestamptz not null default now(),
  updated              timestamptz not null default now()
);

create table cursuri (
  id                      uuid primary key default gen_random_uuid(),
  numele                  text not null,
  stil                    text,
  nivelul                 nivel_curs,
  varsta                  varsta_curs,
  teacher                 uuid,
  sala                    uuid,
  sezon                   uuid,
  facultativ              boolean not null default false,
  pret_anual              numeric,
  pret_lunar              numeric,
  pret_sedinta            numeric,
  pret_lunar_promo        numeric,
  capacitate_maxima       integer,
  participari_eveniment   boolean not null default false,
  zile                    zi_saptamana,
  ora                     text,
  durata_cursului         numeric,
  one_time                boolean not null default false,
  suspendat               boolean not null default false,
  old_sub_id              bigint,
  created                 timestamptz not null default now(),
  updated                 timestamptz not null default now()
);

create table vouchere (
  id              uuid primary key default gen_random_uuid(),
  cod_voucher     text not null,
  descriere       text,
  tip             tip_voucher,
  valoare         numeric,
  data_inceperii  date,
  data_expirarii  date,
  numar_utilizari integer,
  client          uuid,
  curs            uuid,
  tip_enrollment  tip_plata,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now()
);

create table enrollments (
  id                    uuid primary key default gen_random_uuid(),
  client                uuid,
  cursul                uuid,
  tip_plata             tip_plata,
  suma                  numeric,
  data_incepere         date,
  data_final            date,
  activ                 boolean not null default true,
  foloseste_pret_promo  boolean not null default false,
  voucher               uuid,
  retrogradat           boolean not null default false,
  reziliat              boolean not null default false,
  old_user_sub_id       bigint,
  created               timestamptz not null default now(),
  updated               timestamptz not null default now()
);

create table inventar (
  id         uuid primary key default gen_random_uuid(),
  articol    text not null,
  descriere  text,
  stoc       integer,
  pret       text,
  locatie    uuid,
  categorie  categorie_inventar,
  created    timestamptz not null default now(),
  updated    timestamptz not null default now()
);

create table evenimente (
  id               uuid primary key default gen_random_uuid(),
  nume_eveniment   text not null,
  descriere        text,
  participant      uuid[] not null default '{}',
  data             date,
  locatia          text,
  organizator      uuid,
  capacitate       integer,
  pret_bilet       numeric,
  status           status_eveniment,
  notite           text,
  cost_organizare  numeric,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now()
);

create table incasari (
  id                uuid primary key default gen_random_uuid(),
  client            uuid,
  articol_inventar  uuid,
  bilet             uuid,
  inregistrare      uuid,
  data              date,
  suma              numeric,
  bucati            integer,
  metoda            metoda_plata,
  voucher           uuid,
  sezon             uuid,
  observatii        text,
  created           timestamptz not null default now(),
  updated           timestamptz not null default now()
);

create table prezente (
  id          uuid primary key default gen_random_uuid(),
  client      uuid,
  enrollment  uuid,
  data        date,
  status      status_prezenta,
  created     timestamptz not null default now(),
  updated     timestamptz not null default now()
);

create table concursuri (
  id                  uuid primary key default gen_random_uuid(),
  numele_concursului  text not null,
  data_evenimentului  date,
  trupa               uuid[] not null default '{}',
  participanti        uuid[] not null default '{}',
  rezultate_obtinute  text,
  locul_i             integer,
  locul_ii            integer,
  locul_iii           integer,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now()
);

create table feedback (
  id                  uuid primary key default gen_random_uuid(),
  nume                text,
  tip                 tip_feedback,
  autor               uuid,
  reprezentant        uuid,
  cursul              uuid,
  detalii             text,
  rezolvat            boolean not null default false,
  detalii_rezolvare   text,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now()
);

create table cheltuieli (
  id         uuid primary key default gen_random_uuid(),
  nume       text not null,
  descriere  text,
  valoare    numeric,
  achitat    boolean not null default false,
  deadline   date,
  created    timestamptz not null default now(),
  updated    timestamptz not null default now()
);

create table leads (
  id             uuid primary key default gen_random_uuid(),
  nume           text not null,
  nume_parinte   text,
  varsta         integer,
  telefon        text,
  sexul          sex,
  email          text,
  sursa          uuid,
  id_client      uuid,
  data_followup  date,
  observatii     text,
  interes        interes_lead,
  status         status_lead,
  data_nasterii  date,
  locatia        text,
  cod_voucher    text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  created        timestamptz not null default now(),
  updated        timestamptz not null default now()
);

create table programari_leads (
  id                uuid primary key default gen_random_uuid(),
  lead              uuid,
  interes           interes_programare,
  locatie           uuid,
  data_programarii  date,
  cursul_programat  uuid,
  observatii        text,
  created           timestamptz not null default now(),
  updated           timestamptz not null default now()
);

create table prospecti (
  id               uuid primary key default gen_random_uuid(),
  nume             text not null,
  telefon          text,
  email            text,
  ultimul_contact  date,
  status           status_prospect,
  campanie         uuid,
  sursa            sursa_prospect,
  detalii          text,
  convertit        boolean not null default false,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now()
);

create table situatie_sms_uri (
  id                uuid primary key default gen_random_uuid(),
  telefon           text,
  cod_mesaj         text,
  locatie           uuid,
  clienti_vizati    uuid[] not null default '{}',
  mesaj             text,
  status            status_sms,
  data_planificata  date,
  data_trimitere    date,
  created           timestamptz not null default now(),
  updated           timestamptz not null default now()
);

create table parametri_aplicatie (
  id       uuid primary key default gen_random_uuid(),
  titlu    text not null,
  valoare  text,
  created  timestamptz not null default now(),
  updated  timestamptz not null default now()
);

-- ============================================================
-- FOREIGN KEYS (relații single, ON DELETE SET NULL — cascade=false în v1)
-- ============================================================
alter table sali             add constraint fk_sali_locatie            foreign key (locatie)    references locatii(id)     on delete set null;
alter table clienti          add constraint fk_clienti_familia         foreign key (familia)    references familii(id)     on delete set null;
alter table cursuri          add constraint fk_cursuri_teacher         foreign key (teacher)    references teacheri(id)    on delete set null;
alter table cursuri          add constraint fk_cursuri_sala            foreign key (sala)       references sali(id)        on delete set null;
alter table cursuri          add constraint fk_cursuri_sezon           foreign key (sezon)      references sezoane(id)     on delete set null;
alter table vouchere         add constraint fk_vouchere_client         foreign key (client)     references clienti(id)     on delete set null;
alter table vouchere         add constraint fk_vouchere_curs           foreign key (curs)       references cursuri(id)     on delete set null;
alter table enrollments      add constraint fk_enrollments_client      foreign key (client)     references clienti(id)     on delete set null;
alter table enrollments      add constraint fk_enrollments_cursul      foreign key (cursul)     references cursuri(id)     on delete set null;
alter table enrollments      add constraint fk_enrollments_voucher     foreign key (voucher)    references vouchere(id)    on delete set null;
alter table inventar         add constraint fk_inventar_locatie        foreign key (locatie)    references locatii(id)     on delete set null;
alter table evenimente       add constraint fk_evenimente_organizator  foreign key (organizator) references teacheri(id)   on delete set null;
alter table incasari         add constraint fk_incasari_client         foreign key (client)     references clienti(id)     on delete set null;
alter table incasari         add constraint fk_incasari_articol        foreign key (articol_inventar) references inventar(id) on delete set null;
alter table incasari         add constraint fk_incasari_bilet          foreign key (bilet)      references evenimente(id)  on delete set null;
alter table incasari         add constraint fk_incasari_inregistrare   foreign key (inregistrare) references enrollments(id) on delete set null;
alter table incasari         add constraint fk_incasari_voucher        foreign key (voucher)    references vouchere(id)    on delete set null;
alter table incasari         add constraint fk_incasari_sezon          foreign key (sezon)      references sezoane(id)     on delete set null;
alter table prezente         add constraint fk_prezente_client         foreign key (client)     references clienti(id)     on delete set null;
alter table prezente         add constraint fk_prezente_enrollment     foreign key (enrollment) references enrollments(id) on delete set null;
alter table feedback         add constraint fk_feedback_autor          foreign key (autor)      references clienti(id)     on delete set null;
alter table feedback         add constraint fk_feedback_reprezentant   foreign key (reprezentant) references familii(id)   on delete set null;
alter table feedback         add constraint fk_feedback_cursul         foreign key (cursul)     references cursuri(id)     on delete set null;
alter table leads            add constraint fk_leads_sursa             foreign key (sursa)      references campanii_promovare(id) on delete set null;
alter table leads            add constraint fk_leads_id_client         foreign key (id_client)  references clienti(id)     on delete set null;
alter table programari_leads add constraint fk_progr_lead              foreign key (lead)       references leads(id)       on delete cascade;
alter table programari_leads add constraint fk_progr_locatie           foreign key (locatie)    references locatii(id)     on delete set null;
alter table programari_leads add constraint fk_progr_curs              foreign key (cursul_programat) references cursuri(id) on delete set null;
alter table prospecti        add constraint fk_prospecti_campanie      foreign key (campanie)   references campanii_promovare(id) on delete set null;
alter table situatie_sms_uri add constraint fk_sms_locatie             foreign key (locatie)    references locatii(id)     on delete set null;

-- ============================================================
-- INDEXURI pe FK-uri (filtrare/join în view-uri)
-- ============================================================
create index idx_sali_locatie         on sali(locatie);
create index idx_clienti_familia      on clienti(familia);
create index idx_cursuri_teacher      on cursuri(teacher);
create index idx_cursuri_sala         on cursuri(sala);
create index idx_cursuri_sezon        on cursuri(sezon);
create index idx_enrollments_client   on enrollments(client);
create index idx_enrollments_cursul   on enrollments(cursul);
create index idx_incasari_inregistrare on incasari(inregistrare);
create index idx_incasari_client      on incasari(client);
create index idx_prezente_enrollment  on prezente(enrollment);
create index idx_prezente_client      on prezente(client);
create index idx_leads_status         on leads(status);

-- ============================================================
-- TRIGGERE updated
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'locatii','sezoane','sali','teacheri','familii','campanii_promovare','clienti',
    'cursuri','vouchere','enrollments','inventar','evenimente','incasari','prezente',
    'concursuri','feedback','cheltuieli','leads','programari_leads','prospecti',
    'situatie_sms_uri','parametri_aplicatie'
  ]
  loop
    execute format(
      'create trigger trg_%I_updated before update on %I for each row execute function set_updated_timestamp()',
      t, t
    );
  end loop;
end $$;
