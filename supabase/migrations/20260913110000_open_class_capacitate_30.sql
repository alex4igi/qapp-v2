-- Excepție cerută de Alex la standardizarea capacităților (12 sept. 2026):
-- `S Open Class` rămâne pe 30, nu coboară la 25 ca restul grupelor din Sala 1.
--
-- De ce e o excepție legitimă: la open class nimeni nu ocupă un loc permanent —
-- capacitatea e limita unei singure ședințe, iar `open_class_rpc` o copiază în
-- `open_sesiuni.capacitate` la crearea fiecărei sesiuni. Deci 30 aici nu
-- înseamnă „grupă de 30", înseamnă „30 de rezervări pe o ședință". Nu atinge
-- salariile: titularul e „Open Teacher", nu o persoană.
--
-- 30 e tot una din cele 5 trepte, deci presetul rămâne respectat. Ce NU mai e
-- respectat e standardul sălii (25), iar `check-capacitate-grupe.mjs` raportează
-- de acum abaterile de la standardul sălii ca informative, nu ca erori.

update cursuri c
   set capacitate_maxima = 30
  from sali s
 where c.sala = s.id
   and s.nume = 'Sala 1'
   and c.numele = 'S Open Class'
   and coalesce(c.facultativ, false)
   and c.capacitate_maxima <> 30;
