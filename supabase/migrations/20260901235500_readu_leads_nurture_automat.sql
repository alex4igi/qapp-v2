-- Qapp v2 — readuce în pipeline leadurile pe care cronul le-a trimis în nurture
-- în ultimele 30 de zile.
--
-- Context: regulile de auto-nurture erau prea agresive (vezi 20260901210000 +
-- fixul `autoNurture: false` pe bucketul 'nou' din cron-evening). 53 de oameni
-- reali au ieșit din pipeline fără ca cineva să-i fi lucrat. Se întorc în etapa
-- din care au fost luați.
--
-- Scop strict:
--   * doar mutările făcute de CRON (`lead_history.user_id is null`) — deciziile
--     luate de un om rămân în picioare;
--   * doar leadurile care sunt ȘI ACUM în nurture;
--   * fără ex-clienți (`id_client is not null`): pentru ei nurture e starea
--     corectă, nu o eroare.
--
-- Contoarele se resetează exact ca la butonul „readu din Nurture"
-- (transitions.ts `reactivateFromNurture`): `nr_contactari` = seria de încercări
-- consecutive fără răspuns, iar reactivarea rupe seria. Istoricul real al
-- apelurilor rămâne în `lead_contacte`, neatins.

with ultima_mutare as (
  select distinct on (h.lead_id)
    h.lead_id, h.old_value, h.user_id
  from lead_history h
  where h.action_type = 'status_change'
    and h.new_value = 'nurture'
    and h.created_at >= now() - interval '30 days'
  order by h.lead_id, h.created_at desc
),
tinta as (
  select
    u.lead_id,
    -- 'programat' cu programarea deja trecută s-ar întoarce doar ca să fie
    -- reprocesat diseară; îl ducem direct în etapa reală.
    case
      when u.old_value = 'programat'
       and not exists (
             select 1 from programari_leads pl
             where pl.lead = u.lead_id and pl.data_programarii >= current_date
           )
      then 'nu_a_venit'
      else u.old_value
    end::status_lead as status_nou
  from ultima_mutare u
  join leads l on l.id = u.lead_id
  where u.user_id is null
    and l.status = 'nurture'
    and l.id_client is null
    and u.old_value is not null
)
update leads l
set status           = t.status_nou,
    sub_status       = null,
    nr_contactari    = 0,
    flag_reminder    = false,
    flag_streak      = 0,
    flag_reminder_at = null
from tinta t
where l.id = t.lead_id;
