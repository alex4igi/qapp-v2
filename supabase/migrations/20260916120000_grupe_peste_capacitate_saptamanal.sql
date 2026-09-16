-- Verificarea „grupă plină / peste capacitate" trece de la zilnic la săptămânal.
--
-- Alex, 16 sept. 2026: zilnic i s-a părut redundant. Mesajul pleacă oricum o
-- singură dată per grupă per prag, deci frecvența schimbă doar cât de repede
-- afli — nu câte notificări primești.
--
-- Luni dimineața, ca să pice în același ritm cu Pachetul de luni.
select cron.unschedule('grupe-peste-capacitate-zilnic')
where exists (select 1 from cron.job where jobname = 'grupe-peste-capacitate-zilnic');

select cron.unschedule('grupe-peste-capacitate-saptamanal')
where exists (select 1 from cron.job where jobname = 'grupe-peste-capacitate-saptamanal');

-- 06:30 UTC luni = 09:30 la Iași.
select cron.schedule(
  'grupe-peste-capacitate-saptamanal',
  '30 6 * * 1',
  $$select notifica_grupe_peste_capacitate();$$
);
