-- Alex, 9 oct. 2026: Bianca David intră și ea pe grila de salarizare (simulare în „Salariul meu",
-- confirmare din grilă, inclusă în totalurile din /salarizare). Steagul și garda rămân pentru alte cazuri.
update public.teacheri set in_afara_grilei = false
where id = '306234d0-5ef0-5a54-b552-8b565f35c6f8';

do $$
begin
  if exists (select 1 from public.teacheri where in_afara_grilei) then
    raise exception 'A rămas un instructor în afara grilei.';
  end if;
end $$;
