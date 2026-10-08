-- „Nu răspunde" ca rezultat de contact (Alex, 08.10.2026). Până acum un apel fără răspuns
-- n-avea unde să fie notat: recepția ori lăsa cazul de absență roșu, ori îl marca „Amână"
-- și dispărea din listă. Migrație separată: o valoare nouă de enum nu se poate folosi în
-- aceeași tranzacție în care a fost adăugată.
alter type rezultat_contact add value if not exists 'nu_raspunde';
