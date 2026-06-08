-- Backfill: rândurile create în fluxul vechi (act_status='semnat', semnat direct la
-- adăugarea linkului) devin 'verificat' în noul model (cu pas de aprobare admin).
-- 'semnat' rămâne rezervat pentru esemneaza (Faza 2). Idempotent.
update reinscrieri_gate
set act_status = 'verificat',
    act_verificat_la = coalesce(act_verificat_la, act_semnat_la, now())
where act_status = 'semnat';
