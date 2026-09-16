-- Corecție punctuală: reconcilierea din 14 sept 2026 (Galeriile Ștefan cel
-- Mare) a fost salvată la 17:40 cu total_sistem = 2470. La 17:42–17:43 trei
-- încasări (60 + 60 + 290 = 410 lei) au fost mutate de pe Cash pe Card, deci
-- cash-ul real al zilei e 2060 — exact cât s-a numărat în sertar.
-- Snapshotul rămăsese pe valoarea veche și raporta o lipsă de 410 lei.
-- Garda pe valoarea veche: dacă rândul a fost deja corectat, nu se atinge.

update reconcilieri_cash
   set total_sistem = 2060
 where id = '904ab197-71b5-4b2a-a5a5-aff3bc4c8e5c'
   and data = '2026-09-14'
   and total_sistem = 2470;
