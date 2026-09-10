-- Cursul facultativ se plătește pe lună sau pe ședință — nu are preț anual.
-- Formularul nu mai cere câmpul (și îl golește la salvare), dar rândurile vechi
-- păstrau valori moștenite: 0 din importul v1 sau un preț rămas de pe vremea când
-- cursul era recurent (ex. „N MTV Commercial V" = 1800 în sezonul activ).
-- Le golim ca niciun consumator să nu poată deriva o rată din ele; pentru
-- facultativ, rata lunară e `pret_lunar` (vezi muta_inrolare_curs).
update cursuri
   set pret_anual = null
 where facultativ
   and pret_anual is not null;
