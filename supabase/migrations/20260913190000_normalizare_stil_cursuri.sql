-- Normalizare `cursuri.stil`.
--
-- Câmpul e text liber în formularul de curs, iar cele două locații au derivat
-- separat: Nicolina scria „Street Dance"/„Dans"/„Acrobatica"/„K-Pop", Ștefan cel
-- Mare scria „Streetdance"/„kpop". Aceeași disciplină apărea sub 3 nume, deci
-- orice grupare pe stil (orar public, rapoarte) o număra de 3 ori.
--
-- Vocabularul canonic: Street Dance · Gimnastica · K-Pop · Open.
-- Forma „Street Dance" e cea din materialele de site și din codul aplicației.

update public.cursuri
set stil = case
  when lower(replace(stil, ' ', '')) = 'streetdance' then 'Street Dance'
  when lower(stil) = 'dans' then 'Street Dance'
  when lower(stil) in ('gimnastica', 'acrobatica') then 'Gimnastica'
  when lower(replace(stil, '-', '')) = 'kpop' then 'K-Pop'
  else stil
end
where stil is not null;

-- Grupa „N Gimnastica Junior INC MJ" era trecută pe street dance, contrar
-- numelui ei; confirmat de owner că e gimnastică (ambele sezoane, e aceeași
-- grupă clonată).
update public.cursuri
set stil = 'Gimnastica'
where numele = 'N Gimnastica Junior INC MJ';
