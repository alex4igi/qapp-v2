-- Patru cursuri de vară au fost mutate manual în „Sezon 2026-2027" pe 28 aug 2026,
-- prin editarea câmpului Sezon din formularul de curs (clonarea de sezon rulase deja
-- la 09:39 și e insert-only — nu ea a mutat nimic). Rândurile mutate poartă însă toată
-- istoria verii: 178 înrolări cu `sezon_id = Vara 2026` și ~700 de prezențe în iulie și
-- august. Efect: `calculeaza_salariu_teacher` filtrează cursurile pe sezonul care deține
-- luna, deci grupele au dispărut din fișele de salariu iulie/august a trei instructori
-- (Ioana Perju 1, Eva Manolica 2, Ana Plesescu 1) și din rapoartele sezonului de vară.
--
--   e98d92b2 S SD Junior INT   (Ioana Perju)   152 prez. iul · 110 aug ·  88 înrolări
--   292bfa6d S MaJ Teen INT    (Eva Manolica)   52 prez. iul ·  48 aug ·  42 înrolări
--   1e3c59d8 S LMi Junior INC  (Eva Manolica)   31 prez. iul ·  18 aug ·  19 înrolări
--   937cbe0f K Tiny Mi         (Ana Plesescu)   30 prez. iul ·  20 aug ·  29 înrolări
--
-- Reparație: rândul istoric se întoarce în Vara 2026 cu configurația de vară, iar pentru
-- sezonul 2026-2027 se creează rânduri noi cu configurația setată pe 28 aug (adică exact
-- ce ar fi produs clonarea), legate prin `cursul_original` de grupa de vară.
--
-- Prețul lunar de vară e dedus din `suma` efectiv facturată pe înrolările de vară, nu
-- ghicit: 260 pe cele trei grupe „S" (28/13/5 abonamente la 260, plus 234 = 260 − 10%)
-- și 170 pe K Tiny Mi (9 abonamente la 170, plus 153 = 170 − 10%). Restul configurației
-- de vară e uniformă pe toate cele 30 de cursuri rămase în Vara 2026: `facultativ = true`,
-- fără preț promo/anual, ședință 50, `pret_sedinta_reziliere` NULL.

do $$
declare
  v_vara uuid := 'e475cebc-2706-425a-ba56-ede51f8abd88';  -- Vara 2026
  v_nou  uuid := '7ef50018-03f9-4e51-8357-1266a4bf9f69';  -- Sezon 2026-2027
  v_id uuid;
  v_pret_vara numeric;
  v_curs cursuri%rowtype;
  v_new uuid;
begin
  for v_id, v_pret_vara in
    select * from (values
      ('e98d92b2-aeb7-4b71-8364-58e914879205'::uuid, 260::numeric),
      ('292bfa6d-04fa-4844-912e-22d68ebb47fc'::uuid, 260::numeric),
      ('1e3c59d8-11f2-4158-8748-128f3febcaa7'::uuid, 260::numeric),
      ('937cbe0f-4ca7-450b-9b72-14687e939519'::uuid, 170::numeric)
    ) as t(id, pret)
  loop
    -- Idempotent: dacă rândul a fost deja readus în Vara (sau nu există), sare peste.
    select * into v_curs from cursuri where id = v_id and sezon = v_nou;
    if not found then
      continue;
    end if;

    -- Rândul de sezon nou = configurația setată pe 28 aug, ca o clonă normală.
    insert into cursuri (
      numele, stil, nivelul, varsta, teacher, sala, locatie, sezon,
      facultativ, pret_anual, pret_lunar, pret_sedinta, pret_lunar_promo,
      pret_sedinta_reziliere, capacitate_maxima, participari_eveniment,
      zile, ora, durata_cursului, one_time, suspendat, rezervari_online,
      cursul_original
    ) values (
      v_curs.numele, v_curs.stil, v_curs.nivelul, v_curs.varsta, v_curs.teacher,
      v_curs.sala, v_curs.locatie, v_nou,
      v_curs.facultativ, v_curs.pret_anual, v_curs.pret_lunar, v_curs.pret_sedinta,
      v_curs.pret_lunar_promo, v_curs.pret_sedinta_reziliere, v_curs.capacitate_maxima,
      v_curs.participari_eveniment, v_curs.zile, v_curs.ora, v_curs.durata_cursului,
      v_curs.one_time, false, v_curs.rezervari_online,
      v_curs.id
    )
    returning id into v_new;

    -- Titularul ajunge și în M:N (sursa de adevăr pentru accesul teacherului).
    if v_curs.teacher is not null then
      insert into cursuri_teacheri (curs_id, teacher_id, rol)
      values (v_new, v_curs.teacher, 'titular')
      on conflict (curs_id, teacher_id) do nothing;
    end if;

    -- Rândul istoric se întoarce în vară, cu prețurile și regimul de vară.
    update cursuri set
      sezon = v_vara,
      facultativ = true,
      pret_lunar = v_pret_vara,
      pret_lunar_promo = null,
      pret_anual = null,
      pret_sedinta = 50,
      pret_sedinta_reziliere = null
    where id = v_curs.id;
  end loop;
end $$;
