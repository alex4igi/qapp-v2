-- Confirmarea inrolarii nu se mai trimite la 5 min, ci la cronul de a doua zi
-- (cron-morning, 10:00 local). send_after = maine 00:00 (Europe/Bucharest), ca
-- randul creat azi sa fie procesat la rularea de maine dimineata, lasand o
-- fereastra de undo de ore intregi. Drenarea s-a mutat din functia separata
-- cron-confirmari-sms (eliminata) direct in cron-morning.
alter table confirmari_inrolare_sms
  alter column send_after set default
    ((date_trunc('day', now() at time zone 'Europe/Bucharest') + interval '1 day')
      at time zone 'Europe/Bucharest');
